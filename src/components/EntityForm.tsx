import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, ErrorBox, Field, inputCls } from './ui';
import type { EntityDef, FieldDef } from '../lib/entities';
import { keyColumn, loadOptions, saveRow, type Option, type Row } from '../lib/data';
import { toNum } from '../lib/format';
import { tf, t } from '../lib/i18n';

const NUMERIC = ['money', 'number', 'qty', 'int', 'pct'];

function LookupSelect({ field, value, onChange, values, parent, parentKey, editing, disabled }: {
  field: FieldDef; value: unknown; onChange: (v: string) => void; values: Row; parent: Row | null;
  parentKey: string | null; editing: boolean; disabled?: boolean;
}) {
  const [opts, setOpts] = useState<Option[] | null>(null);
  const extra = !editing && field.lookupFilter ? field.lookupFilter(values, parent, parentKey) : {};
  const extraKey = JSON.stringify(extra);
  useEffect(() => {
    let alive = true;
    loadOptions({ ...field.lookup!, filters: { ...(field.lookup!.filters ?? {}), ...extra } })
      .then((o) => { if (alive) setOpts(o); })
      .catch(() => { if (alive) setOpts([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.name, extraKey]);
  const current = value === null || value === undefined ? '' : String(value);
  const missing = current && opts && !opts.some((o) => o.value === current);
  return (
    <select className={inputCls} value={current} disabled={disabled || !opts} onChange={(e) => onChange(e.target.value)} required={field.required}>
      <option value="">{opts ? '— select —' : t('common.loading')}</option>
      {missing && <option value={current}>(current selection)</option>}
      {opts?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function initialValues(def: EntityDef, initial: Row | null, fixed: Row): Row {
  const v: Row = {};
  for (const f of def.fields) {
    if (initial) v[f.name] = initial[f.name] ?? (f.type === 'checkbox' ? false : f.type === 'tags' ? [] : '');
    else {
      const d = typeof f.default === 'function' ? (f.default as () => unknown)() : f.default;
      v[f.name] = d ?? (f.type === 'checkbox' ? false : f.type === 'tags' ? [] : '');
    }
  }
  if (def.statuses && !def.fields.some((f) => f.name === 'status')) v.status = initial?.status ?? def.statuses[0];
  return { ...v, ...fixed };
}

export function EntityForm({ def, initial, fixed = {}, parent = null, parentKey = null, onSaved, onCancel }: {
  def: EntityDef; initial: Row | null; fixed?: Row; parent?: Row | null; parentKey?: string | null;
  onSaved: (row: Row) => void; onCancel: () => void;
}) {
  const editing = Boolean(initial?.id ?? initial?.code);
  const [values, setValues] = useState<Row>(() => initialValues(def, initial, fixed));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  const statusField: FieldDef | null = useMemo(() => (def.statuses && !def.fields.some((f) => f.name === 'status') && editing
    ? { name: 'status', label: 'Status', type: 'select', options: def.statuses } : null), [def, editing]);
  const fields = [...def.fields, ...(statusField ? [statusField] : [])].filter((f) => !(f.name in fixed));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: Row = { ...fixed };
    for (const f of fields) {
      if (editing && f.readOnlyOnEdit) continue;
      const visible = !f.showIf || f.showIf(values);
      let v = visible ? values[f.name] : null;
      if (f.type === 'checkbox') v = Boolean(v);
      else if (NUMERIC.includes(f.type)) v = v === '' || v === null || v === undefined ? null : toNum(v);
      else if (f.type === 'tags') v = Array.isArray(v) ? v : [];
      else if (v === '') v = null;
      if (f.required && visible && (v === null || v === undefined)) { setError(`${tf(f.name, f.label)}: ${t('common.required')}`); return; }
      payload[f.name] = v;
    }
    setSaving(true);
    try {
      const row = await saveRow(def.table, payload, editing ? (initial![keyColumn(def.table)] as string) : null);
      onSaved(row);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <ErrorBox error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.filter((f) => !f.showIf || f.showIf(values)).map((f) => {
          const label = tf(f.name, f.label);
          const disabled = editing && f.readOnlyOnEdit;
          const v = values[f.name];
          if (f.type === 'checkbox') {
            return (
              <label key={f.name} className="flex items-center gap-2 self-end py-1.5 text-sm">
                <input type="checkbox" checked={Boolean(v)} disabled={disabled} onChange={(e) => set(f.name, e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                {label}
              </label>
            );
          }
          let input;
          if (f.type === 'lookup') {
            input = <LookupSelect field={f} value={v} onChange={(x) => set(f.name, x)} values={values} parent={parent} parentKey={parentKey} editing={editing} disabled={disabled} />;
          } else if (f.type === 'select') {
            input = (
              <select className={inputCls} value={v ?? ''} disabled={disabled} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">— select —</option>
                {f.options!.map((o) => typeof o === 'string'
                  ? <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
                  : <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            );
          } else if (f.type === 'tags') {
            const arr: string[] = Array.isArray(v) ? v : [];
            input = (
              <div className="flex flex-wrap gap-1.5">
                {f.options!.map((o) => {
                  const val = typeof o === 'string' ? o : o.value;
                  const on = arr.includes(val);
                  return (
                    <button type="button" key={val} onClick={() => set(f.name, on ? arr.filter((x) => x !== val) : [...arr, val])}
                      className={`rounded-full px-2.5 py-1 text-xs ring-1 ${on ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300'}`}>
                      {on ? '✓ ' : ''}{typeof o === 'string' ? o : o.label}
                    </button>
                  );
                })}
              </div>
            );
          } else if (f.type === 'textarea') {
            input = <textarea className={inputCls} rows={2} value={v ?? ''} disabled={disabled} onChange={(e) => set(f.name, e.target.value)} />;
          } else if (f.type === 'date') {
            input = <input type="date" className={inputCls} value={v ? String(v).slice(0, 10) : ''} disabled={disabled} onChange={(e) => set(f.name, e.target.value)} />;
          } else if (NUMERIC.includes(f.type)) {
            input = <input type="number" inputMode="decimal" step="any" className={`${inputCls} text-right tabular-nums`} value={v ?? ''} disabled={disabled} onChange={(e) => set(f.name, e.target.value)} />;
          } else {
            input = <input type="text" className={inputCls} value={v ?? ''} disabled={disabled} onChange={(e) => set(f.name, e.target.value)} />;
          }
          return <Field key={f.name} label={label} span={f.span} help={f.help} required={f.required}>{input}</Field>;
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" disabled={saving}>{saving ? '…' : t('common.save')}</Button>
      </div>
    </form>
  );
}
