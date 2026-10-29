import { useMemo, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { Button, Card, ErrorBox, Field, Notice, PageHeader, inputCls } from '../components/ui';
import { ENTITIES, type EntityDef, type FieldDef } from '../lib/entities';
import { loadOptions, type Option, type Row } from '../lib/data';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { exportXlsx } from '../lib/exporters';
import { parseDate, toNum } from '../lib/format';

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const NUMERIC = ['money', 'number', 'qty', 'int', 'pct'];

function importFields(def: EntityDef): FieldDef[] {
  const f = [...def.fields];
  if (def.statuses && !f.some((x) => x.name === 'status')) f.push({ name: 'status', label: 'Status', type: 'select', options: def.statuses });
  return f;
}

/** Index every text value of each lookup option so "USD", a bank name, an LC no. or a code all resolve. */
async function buildLookupIndex(fields: FieldDef[]) {
  const idx: Record<string, Map<string, string>> = {};
  for (const f of fields.filter((x) => x.type === 'lookup')) {
    const opts: Option[] = await loadOptions({ ...f.lookup!, select: '*' });
    const m = new Map<string, string>();
    for (const o of opts) {
      m.set(norm(o.label), o.value);
      for (const v of Object.values(o.row)) if (typeof v === 'string' && v.length > 1 && v.length < 120) { const k = norm(v); if (!m.has(k)) m.set(k, o.value); }
    }
    idx[f.name] = m;
  }
  return idx;
}

function convert(f: FieldDef, raw: unknown, idx: Record<string, Map<string, string>>): { value: unknown; error?: string } {
  if (raw === null || raw === undefined || String(raw).trim() === '') return { value: null };
  switch (f.type) {
    case 'date': { const d = parseDate(raw); return d ? { value: d } : { value: null, error: `bad date "${raw}"` }; }
    case 'checkbox': return { value: ['1', 'y', 'yes', 'true', 'x'].includes(norm(raw)) };
    case 'tags': return { value: String(raw).split(/[,;]+/).map((s) => s.trim()).filter(Boolean) };
    case 'lookup': { const v = idx[f.name]?.get(norm(raw)); return v ? { value: v } : { value: null, error: `"${raw}" not found in ${f.label}` }; }
    case 'select': {
      const o = f.options!.map((x) => (typeof x === 'string' ? { value: x, label: x } : x)).find((x) => norm(x.value) === norm(raw) || norm(x.label) === norm(raw));
      return o ? { value: o.value } : { value: null, error: `"${raw}" is not a valid ${f.label}` };
    }
    default:
      if (NUMERIC.includes(f.type)) { const n = toNum(raw); return isNaN(n) ? { value: null, error: `bad number "${raw}"` } : { value: n }; }
      return { value: String(raw).trim() };
  }
}

export default function ExcelImport() {
  const { canWrite } = useAuth();
  const targets = Object.values(ENTITIES).filter((e) => e.importable && canWrite(e.table));
  const [target, setTarget] = useState(targets[0]?.key ?? '');
  const def = ENTITIES[target];
  const fields = useMemo(() => (def ? importFields(def) : []), [def]);
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [sheet, setSheet] = useState('');
  const [headerRow, setHeaderRow] = useState(1);
  const [map, setMap] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: number; failed: Row[] } | null>(null);
  const [preview, setPreview] = useState<{ rows: Row[]; errors: string[][] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data: Row[] = useMemo(() => {
    if (!wb || !sheet) return [];
    return XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheet], { range: headerRow - 1, defval: null, raw: true });
  }, [wb, sheet, headerRow]);
  const headers = useMemo(() => [...new Set(data.slice(0, 50).flatMap((r) => Object.keys(r)))].filter((h) => !h.startsWith('__EMPTY')), [data]);

  function autoMap(hs: string[]) {
    const m: Record<string, string> = {};
    for (const f of fields) {
      const hit = hs.find((h) => norm(h) === norm(f.label) || norm(h) === norm(f.name) || norm(h) === norm(f.name.replace(/_id$/, '')));
      if (hit) m[f.name] = hit;
    }
    setMap(m);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setResult(null); setPreview(null);
    try {
      const w = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      setWb(w); setSheet(w.SheetNames[0]); setHeaderRow(1);
      const rows = XLSX.utils.sheet_to_json<Row>(w.Sheets[w.SheetNames[0]], { defval: null });
      autoMap([...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))]);
    } catch (x) { setError(`Could not read file: ${(x as Error).message}`); }
  }

  async function validate(): Promise<{ rows: Row[]; errors: string[][] }> {
    const idx = await buildLookupIndex(fields.filter((f) => map[f.name]));
    const rows: Row[] = []; const errors: string[][] = [];
    for (const src of data) {
      if (Object.values(src).every((v) => v === null || v === '')) continue;
      const out: Row = {}; const errs: string[] = [];
      for (const f of fields) {
        if (!map[f.name]) {
          const d = typeof f.default === 'function' ? (f.default as () => unknown)() : f.default;
          if (d !== undefined) out[f.name] = d;
          continue;
        }
        const { value, error } = convert(f, src[map[f.name]], idx);
        if (error) errs.push(`${f.label}: ${error}`);
        out[f.name] = value;
      }
      for (const f of fields) if (f.required && (out[f.name] === null || out[f.name] === undefined)) errs.push(`${f.label}: required`);
      rows.push(out); errors.push(errs);
    }
    return { rows, errors };
  }

  async function doPreview() { setBusy(true); setError(null); try { setPreview(await validate()); } catch (x) { setError((x as Error).message); } finally { setBusy(false); } }

  async function doImport() {
    if (!preview) return;
    setBusy(true); setError(null);
    let ok = 0; const failed: Row[] = [];
    for (let i = 0; i < preview.rows.length; i++) {
      if (preview.errors[i].length) { failed.push({ row: i + headerRow + 1, error: preview.errors[i].join('; ') }); continue; }
      const clean = Object.fromEntries(Object.entries(preview.rows[i]).filter(([, v]) => v !== undefined));
      const { error } = await supabase.from(def.table).insert(clean);
      if (error) failed.push({ row: i + headerRow + 1, error: error.message }); else ok++;
    }
    setResult({ ok, failed }); setPreview(null); setBusy(false);
  }

  function template() {
    exportXlsx(`${def.title} import template`, [{ name: def.title.slice(0, 31), columns: fields.map((f) => ({ key: f.name, label: f.label })), rows: [] }]);
  }

  if (!targets.length) return <Notice>You have no screens you can import into.</Notice>;
  const okCount = preview ? preview.errors.filter((e) => !e.length).length : 0;

  return (
    <div>
      <PageHeader title="Excel Import" subtitle="Load existing trackers. Map your columns, check the preview, then import. Links (buyer, bank, LC…) are matched by name / number." />
      <ErrorBox error={error} />
      <Card title="1. What are you importing?" className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Target"><select className={inputCls} value={target} onChange={(e) => { setTarget(e.target.value); setMap({}); setPreview(null); setResult(null); }}>
            {targets.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}</select></Field>
          <Button variant="secondary" onClick={template}>⬇ Blank template</Button>
          <label className="inline-flex cursor-pointer items-center rounded-md bg-brand-700 px-3.5 py-2 text-sm font-medium text-white">⬆ Choose .xlsx / .csv
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} /></label>
        </div>
      </Card>

      {wb && (
        <Card title="2. Map columns" className="mb-4" actions={<Button small variant="ghost" onClick={() => autoMap(headers)}>Auto-match</Button>}>
          <div className="mb-3 flex flex-wrap gap-2">
            <Field label="Sheet"><select className={inputCls} value={sheet} onChange={(e) => setSheet(e.target.value)}>{wb.SheetNames.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Header row"><input type="number" min={1} className={`${inputCls} w-24`} value={headerRow} onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value)))} /></Field>
            <span className="self-end pb-2 text-xs text-slate-500">{data.length} data rows</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <Field key={f.name} label={`${f.label}${f.type === 'lookup' ? ' (matched by name/no.)' : ''}`} required={f.required}>
                <select className={inputCls} value={map[f.name] ?? ''} onChange={(e) => setMap({ ...map, [f.name]: e.target.value })}>
                  <option value="">— not in file —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            ))}
          </div>
          <div className="mt-3 flex justify-end"><Button onClick={doPreview} disabled={busy}>{busy ? '…' : 'Check & preview'}</Button></div>
        </Card>
      )}

      {preview && (
        <Card title={`3. Preview — ${okCount} ready, ${preview.rows.length - okCount} with problems`} className="mb-4"
          actions={<Button onClick={doImport} disabled={busy || okCount === 0}>{busy ? 'Importing…' : `Import ${okCount} rows`}</Button>}>
          <div className="max-h-96 overflow-auto text-xs">
            <table className="min-w-full">
              <thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-1 text-left">#</th><th className="px-2 text-left">Problems</th>
                {fields.filter((f) => map[f.name]).map((f) => <th key={f.name} className="px-2 text-left">{f.label}</th>)}</tr></thead>
              <tbody>
                {preview.rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className={preview.errors[i].length ? 'bg-red-50' : ''}>
                    <td className="px-2 py-1">{i + headerRow + 1}</td>
                    <td className="px-2 text-red-700">{preview.errors[i].join('; ')}</td>
                    {fields.filter((f) => map[f.name]).map((f) => <td key={f.name} className="px-2">{f.type === 'lookup' && r[f.name] ? '✓' : String(r[f.name] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Rows with problems are skipped. Business rules (e.g. BTB entitlement) are still checked by the database on import.</p>
        </Card>
      )}

      {result && (
        <Notice tone={result.failed.length ? 'warn' : 'good'}>
          Imported {result.ok} rows. {result.failed.length > 0 && <>{result.failed.length} failed — <button className="underline" onClick={() =>
            exportXlsx('Import errors', [{ name: 'Errors', columns: [{ key: 'row', label: 'Excel row', type: 'int' }, { key: 'error', label: 'Error' }], rows: result.failed }])}>download error list</button>.</>}
        </Notice>
      )}
    </div>
  );
}
