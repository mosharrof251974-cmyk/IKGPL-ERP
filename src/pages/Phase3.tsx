import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { Button, Card, ErrorBox, Field, Kpi, Modal, Notice, PageHeader, Spinner, Tabs, inputCls } from '../components/ui';
import { fetchRows, useAsync, type Row } from '../lib/data';
import { supabase, check } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { exportXlsx } from '../lib/exporters';
import { bondStatementPdf, bondStatementSheets, type BondTemplate } from '../lib/documents';
import { fmtCompact, fmtDate, todayISO, toNum } from '../lib/format';
import { ENTITIES } from '../lib/entities';

// ---------------------------------------------------------------- Customs bond statement
export function BondStatementPage() {
  const { settings, company } = useAuth();
  const tpl = settings['template.bond_statement'] as BondTemplate | undefined;
  const { data: licenses } = useAsync(() => fetchRows('bond_licenses', { filters: { status: { op: 'neq', value: 'void' } }, order: [{ column: 'valid_from', ascending: false }] }), []);
  const [licenseId, setLicenseId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayISO());
  const [result, setResult] = useState<{ summary: Row[]; imports: Row[]; exports: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const license = licenses?.find((l) => l.id === licenseId) ?? licenses?.[0];

  async function run() {
    if (!license) return;
    const f = from || license.valid_from;
    setBusy(true); setError(null);
    try {
      const [summary, imports, exports] = await Promise.all([
        supabase.rpc('bond_statement', { p_license: license.id, p_from: f, p_to: to }).then(check),
        supabase.rpc('bond_import_entries', { p_from: f, p_to: to }).then(check),
        supabase.rpc('bond_export_entries', { p_from: f, p_to: to }).then(check),
      ]);
      setResult({ summary: summary as Row[], imports: imports as Row[], exports: (exports as Row[]).filter((r) => r.item_id) });
      if (!from) setFrom(f);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const header: Row = license ? {
    company, license: { ...license, validity: `${fmtDate(license.valid_from)} to ${fmtDate(license.valid_to)}` },
    period: `${fmtDate(from || license.valid_from)} to ${fmtDate(to)}`,
  } : {};
  const sheets = tpl && result ? bondStatementSheets(tpl, header, result.summary, result.imports, result.exports) : null;
  const negatives = result?.summary.filter((r) => toNum(r.closing) < 0) ?? [];
  const noUd = result?.exports.length === 0 && result?.imports.length;

  return (
    <div>
      <PageHeader title="Customs Bond Statement" subtitle="Opening + imports (Bill of Entry wise) − consumption (Bill of Export × UD coefficient) = closing"
        actions={sheets && tpl && <>
          <Button variant="secondary" onClick={() => exportXlsx(`Bond Statement ${header.period}`, sheets)}>⬇ Excel</Button>
          <Button variant="secondary" onClick={() => bondStatementPdf(tpl, header, sheets)}>⬇ PDF</Button>
        </>} />
      {!tpl && <Notice tone="bad">Bond statement template missing (Admin › Settings & Templates).</Notice>}
      <Notice tone="info">Layout follows the editable template in Admin › Settings & Templates. Send the Bond Commissionerate's format and the template will be set to match it exactly.</Notice>
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Bond license">
            <select className={inputCls} value={license?.id ?? ''} onChange={(e) => setLicenseId(e.target.value)}>
              {(licenses ?? []).map((l) => <option key={l.id} value={l.id}>{l.license_no} ({fmtDate(l.valid_from)} – {fmtDate(l.valid_to)})</option>)}
            </select>
          </Field>
          <Field label="From"><input type="date" className={inputCls} value={from || license?.valid_from || ''} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button onClick={run} disabled={!license || busy}>{busy ? '…' : 'Generate'}</Button>
        </div>
      </Card>
      <ErrorBox error={error} />
      {negatives.length > 0 && <Notice tone="bad">Negative closing balance for {negatives.map((n) => n.item_name).join(', ')} — check missing GRNs / Bills of Entry, opening balance or UD coefficients.</Notice>}
      {noUd ? <Notice>No consumption found. Check that exports have a Bill of Export date and that their Master LC has a UD with material coefficients.</Notice> : null}
      {sheets?.map((sh) => (
        <Card key={sh.name} title={sh.title} className="mb-4">
          <DataTable columns={sh.columns} rows={sh.rows} exportName={sh.name} compact />
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Cash incentive
export function IncentivePage() {
  const nav = useNavigate();
  const { canWrite } = useAuth();
  const [tab, setTab] = useState('eligible');
  const [creating, setCreating] = useState<Row | null>(null);
  const [claimNo, setClaimNo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const { data, error, loading } = useAsync(async () => ({
    eligible: await fetchRows('v_incentive_eligible', { order: [{ column: 'realization_date', ascending: false }] }),
    claims: await fetchRows('v_incentive_claims', { filters: { status: { op: 'neq', value: 'void' } }, order: [{ column: 'realization_date', ascending: false }] }),
  }), []);
  if (loading) return <Spinner />;
  const claims = data?.claims ?? [];
  const s = (rows: Row[], k: string) => rows.reduce((a, r) => a + toNum(r[k]), 0);
  const pending = claims.filter((c) => ['submitted', 'under_audit'].includes(c.claim_status));

  async function create() {
    setErr(null);
    try {
      const row = check(await supabase.from('incentive_claims').insert({ realization_id: creating!.realization_id, scheme: creating!.scheme, claim_no: claimNo || null }).select('id').single()) as Row;
      nav(`/r/incentive_claims/${row.id}`);
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div>
      <PageHeader title="Cash Incentive" subtitle="Realized shipments appear here automatically; rates come from the Incentive Rates table by shipment date" />
      <ErrorBox error={error} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Eligible, not claimed" value={data?.eligible.length ?? 0} tone={(data?.eligible.length ?? 0) > 0 ? 'warn' : undefined} />
        <Kpi label="Claimed (BDT)" value={`৳${fmtCompact(s(claims.filter((c) => c.claim_status !== 'not_claimed'), 'claim_amount_bdt'))}`} />
        <Kpi label="Received (BDT)" value={`৳${fmtCompact(s(claims, 'received_amount_bdt'))}`} />
        <Kpi label="Pending with bank / audit" value={pending.length} sub={`৳${fmtCompact(s(pending, 'claim_amount_bdt'))}`} />
      </div>
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'eligible', label: 'Eligible (not claimed)', count: data?.eligible.length }, { key: 'claims', label: 'Claims', count: claims.length }]} />
      {tab === 'eligible' && (
        <DataTable exportName="Incentive eligible" rows={data?.eligible ?? []} onRowClick={canWrite('incentive_claims') ? (r) => { setCreating(r); setClaimNo(''); } : undefined}
          toolbar={<span className="text-xs text-slate-500">Tap a row to create its claim</span>}
          columns={[{ key: 'realization_date', label: 'Realized', type: 'date' }, { key: 'bill_ref_no', label: 'Bill' }, { key: 'contract_no', label: 'LC / SC' },
            { key: 'buyer_name', label: 'Buyer' }, { key: 'invoice_nos', label: 'Invoices' }, { key: 'bl_date', label: 'Shipped', type: 'date' },
            { key: 'currency', label: 'Ccy' }, { key: 'realized_amount', label: 'Realized', type: 'money' }, { key: 'scheme', label: 'Scheme' }]} />
      )}
      {tab === 'claims' && (
        <DataTable exportName="Incentive claims" rows={claims} columns={ENTITIES.incentive_claims.columns} totals={['claim_amount_bdt', 'received_amount_bdt']}
          onRowClick={(r) => nav(`/r/incentive_claims/${r.id}`)} />
      )}
      {creating && (
        <Modal title={`Create claim — ${creating.scheme}`} onClose={() => setCreating(null)}>
          <ErrorBox error={err} />
          <p className="mb-3 text-sm text-slate-600">Bill {creating.bill_ref_no} · {creating.contract_no} · realized {fmtDate(creating.realization_date)}. Rate and amount are calculated from the rate table.</p>
          <Field label="Claim No. (optional)"><input className={inputCls} value={claimNo} onChange={(e) => setClaimNo(e.target.value)} /></Field>
          <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreating(null)}>Cancel</Button><Button onClick={create}>Create claim</Button></div>
        </Modal>
      )}
    </div>
  );
}
