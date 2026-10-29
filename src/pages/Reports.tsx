import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { Button, Card, ErrorBox, Field, Kpi, Meter, PageHeader, Spinner, inputCls } from '../components/ui';
import { fetchRows, signedUrl, useAsync, type Row } from '../lib/data';
import { useAuth } from '../lib/auth';
import { exportPdf, exportXlsx, type Sheet } from '../lib/exporters';
import { fmtCompact, fmtDate, fmtMoney, humanize, todayISO, toNum } from '../lib/format';

// ---------------------------------------------------------------- Alerts
export function AlertsPage() {
  const nav = useNavigate();
  const { data, error, loading } = useAsync(() => fetchRows('v_alerts', { order: [{ column: 'due_date' }] }), []);
  const [type, setType] = useState<string>('');
  if (loading) return <Spinner />;
  const rows = (data ?? []).filter((r) => !type || r.alert_type === type);
  const types = [...new Set((data ?? []).map((r) => r.alert_type))];
  return (
    <div>
      <PageHeader title="Alerts" subtitle="Thresholds are set in Admin › Settings. The same list is e-mailed daily when enabled." />
      <ErrorBox error={error} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {['', ...types].map((tp) => (
          <button key={tp || 'all'} onClick={() => setType(tp)} className={`rounded-full px-3 py-1 text-xs ring-1 ${type === tp ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300'}`}>
            {tp ? humanize(tp) : 'All'} ({tp ? (data ?? []).filter((r) => r.alert_type === tp).length : (data ?? []).length})
          </button>
        ))}
      </div>
      <DataTable exportName="Alerts" rows={rows} onRowClick={(r) => nav(`/r/${r.ref_table}/${r.ref_id}`)}
        columns={[{ key: 'severity', label: 'Severity', type: 'status' }, { key: 'alert_type', label: 'Type', type: 'status' }, { key: 'ref_no', label: 'Ref.' },
          { key: 'title', label: 'Detail' }, { key: 'due_date', label: 'Date', type: 'date' }, { key: 'days_left', label: 'Days', type: 'int' },
          { key: 'currency', label: 'Ccy' }, { key: 'amount', label: 'Amount', type: 'money' }]} />
    </div>
  );
}

// ---------------------------------------------------------------- Bank utilization
export const UTIL_COLUMNS = [
  { key: 'bank_name', label: 'Bank' }, { key: 'facility_type', label: 'Facility' },
  { key: 'is_funded', label: 'Funded', type: 'bool' as const }, { key: 'currency', label: 'Ccy' },
  { key: 'limit_amount', label: 'Limit', type: 'money' as const }, { key: 'utilized', label: 'Utilized', type: 'money' as const },
  { key: 'available', label: 'Available', type: 'money' as const }, { key: 'utilization_pct', label: 'Used %', type: 'pct' as const },
  { key: 'valid_to', label: 'Limit Valid To', type: 'date' as const },
];

export function BankUtilizationPage() {
  const { company } = useAuth();
  const { data, error, loading } = useAsync(() => fetchRows('v_bank_utilization', { order: [{ column: 'bank_name' }, { column: 'facility_type' }] }), []);
  if (loading) return <Spinner />;
  const rows = data ?? [];
  const funded = rows.filter((r) => r.is_funded);
  const nonFunded = rows.filter((r) => !r.is_funded);
  const s = (rs: Row[], k: string) => rs.reduce((a, r) => a + toNum(r[k]), 0);
  const sheets: Sheet[] = [
    { name: 'Funded', title: 'Funded facilities — limit vs utilization', columns: UTIL_COLUMNS, rows: funded },
    { name: 'Non-funded', title: 'Non-funded facilities — limit vs utilization', columns: UTIL_COLUMNS, rows: nonFunded },
  ];
  const banks = [...new Set(rows.map((r) => r.bank_name))];
  return (
    <div>
      <PageHeader title="Bank Limits & Utilization" subtitle={`As on ${fmtDate(todayISO())}`}
        actions={<>
          <Button variant="secondary" onClick={() => exportXlsx('Bank limit vs utilization', sheets)}>⬇ Excel</Button>
          <Button variant="secondary" onClick={() => exportPdf('Bank limit vs utilization', sheets, company)}>⬇ PDF</Button>
        </>} />
      <ErrorBox error={error} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Funded limit (USD eq.)" value={`$${fmtCompact(s(funded, 'limit_usd'))}`} sub={`utilized $${fmtCompact(s(funded, 'utilized_usd'))}`} />
        <Kpi label="Non-funded limit (USD eq.)" value={`$${fmtCompact(s(nonFunded, 'limit_usd'))}`} sub={`utilized $${fmtCompact(s(nonFunded, 'utilized_usd'))}`} />
        <Kpi label="Facilities over 85%" value={rows.filter((r) => toNum(r.utilization_pct) >= 85).length} tone={rows.some((r) => toNum(r.utilization_pct) > 100) ? 'bad' : undefined} />
        <Kpi label="Banks" value={banks.length} />
      </div>
      {banks.map((b) => (
        <Card key={b} title={b} className="mb-4">
          <div className="grid gap-4 md:grid-cols-2">
            {[['Funded', funded], ['Non-funded', nonFunded]].map(([label, list]) => (
              <div key={label as string}>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">{label as string}</h3>
                {(list as Row[]).filter((r) => r.bank_name === b).map((r) => (
                  <div key={r.id} className="mb-2 text-sm">
                    <div className="flex justify-between text-xs"><span className="font-medium">{r.facility_type}</span>
                      <span className="tabular-nums">{fmtMoney(r.utilized, r.currency, 0)} of {fmtMoney(r.limit_amount, r.currency, 0)} · available {fmtMoney(r.available, r.currency, 0)}</span></div>
                    <Meter pct={r.utilization_pct === null ? null : Number(r.utilization_pct)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      ))}
      <Card title="How utilization is calculated">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li><b>BTB</b> (non-funded): accepted-but-unpaid plus unaccepted balance of open BTB LCs (sight / deferred) at the bank.</li>
          <li><b>UPAS</b> / <b>EDF</b> LCs: open liability of LCs opened under that type; plus open EDF loans recorded under Finance › PC / EDF Loans.</li>
          <li><b>PC</b>: outstanding packing credit loans. <b>FDBP</b>: purchased / negotiated export bills not yet realized.</li>
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Document store search
export function DocumentsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [docType, setDocType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Row | null>(null);
  const { data, error, loading } = useAsync(() => fetchRows('v_documents', {
    filters: {
      status: { op: 'neq', value: 'void' },
      ...(docType ? { doc_type: docType } : {}),
      ...(from ? { created_at: { op: 'gte', value: from } } : {}),
    },
    order: [{ column: 'created_at', ascending: false }], limit: 2000,
  }), [docType, from]);
  const rows = (data ?? []).filter((r) => (!to || String(r.created_at).slice(0, 10) <= to)
    && (!q || `${r.file_name} ${r.entity_label} ${r.doc_type} ${r.remarks ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const types = [...new Set((data ?? []).map((r) => r.doc_type).filter(Boolean))].sort();
  return (
    <div>
      <PageHeader title="Document Store" subtitle="Every scanned file attached anywhere in the system" />
      <ErrorBox error={error || err} />
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <Field label="Search file / reference"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="LC no., invoice, BL…" /></Field>
        <Field label="Document type"><select className={inputCls} value={docType} onChange={(e) => setDocType(e.target.value)}><option value="">All</option>{types.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Uploaded from"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Uploaded to"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {loading ? <Spinner /> : (
        <DataTable exportName="Document store" rows={rows}
          columns={[{ key: 'file_name', label: 'File' }, { key: 'doc_type', label: 'Type' }, { key: 'entity_label', label: 'Attached to' },
            { key: 'entity_table', label: 'Module', type: 'status' }, { key: 'created_at', label: 'Uploaded', type: 'date' },
            { key: 'uploaded_by_name', label: 'By' }, { key: 'size_kb', label: 'KB', type: 'int', get: (r) => Math.ceil(toNum(r.size_bytes) / 1024) }]}
          onRowClick={setSel} toolbar={<span className="text-xs text-slate-500">Tap a row for options</span>} />
      )}
      {sel && (
        <div className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg md:bottom-6">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{sel.file_name} · {sel.entity_label}</span>
          <Button small onClick={async () => { try { window.open(await signedUrl(sel.storage_path), '_blank'); } catch (e) { setErr((e as Error).message); } }}>Open file</Button>
          <Button small variant="secondary" onClick={() => nav(`/r/${sel.entity_table}/${sel.entity_id}`)}>Go to record</Button>
          <Button small variant="ghost" onClick={() => setSel(null)}>✕</Button>
        </div>
      )}
    </div>
  );
}
