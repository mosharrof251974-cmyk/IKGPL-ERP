import { useMemo, useState, type FC } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorBox, Field, Notice, Spinner, inputCls } from '../components/ui';
import { fetchOne, fetchRows, useAsync, type Row } from '../lib/data';
import { supabase, check } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtMoney, fmtNum, todayISO, toNum } from '../lib/format';
import { commercialInvoicePdf, incentiveClaimPdf, incentiveClaimXlsx, invoiceDocsXlsx, packingListPdf,
         type ClaimTemplate, type InvoiceDocData } from '../lib/documents';

type PanelProps = { row: Row; reload: () => void };

// ---------------------------------------------------------------- Import LC
const ImportLcPanel: FC<PanelProps> = ({ row, reload }) => {
  const { isGM } = useAuth();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const decide = async (approve: boolean) => {
    setError(null);
    const { error } = await supabase.rpc('approve_import_lc', { p_lc: row.id, p_approve: approve, p_note: note || null });
    if (error) setError(error.message); else reload();
  };
  return (
    <div>
      <ErrorBox error={error} />
      {row.exceeds_entitlement && (
        <Notice tone={row.approval_status === 'approved' ? 'info' : 'bad'}>
          BTB opened under <b>{row.contract_no}</b> would exceed its BTB entitlement. GM approval: <b>{row.approval_status}</b>
          {row.approved_at && <> ({fmtDate(row.approved_at)}{row.approval_note ? ` — ${row.approval_note}` : ''})</>}.
          {row.approval_status !== 'approved' && ' The LC can be saved as Draft but cannot be marked Opened until approved.'}
          {isGM && row.approval_status === 'pending' && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <input className={`${inputCls} max-w-sm`} placeholder="Approval note" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button small onClick={() => decide(true)}>✓ Approve</Button>
              <Button small variant="danger" onClick={() => decide(false)}>Reject</Button>
            </div>
          )}
        </Notice>
      )}
      {row.lsd_after_master && <Notice>Last shipment date {fmtDate(row.current_lsd)} is after the Master LC's last shipment date.</Notice>}
      {toNum(row.pi_value) > 0 && Math.abs(toNum(row.pi_value) - toNum(row.current_value)) > 0.01 && (
        <Notice tone="info">Linked PI value {fmtMoney(row.pi_value, row.currency)} differs from LC value {fmtMoney(row.current_value, row.currency)}.</Notice>
      )}
      {row.status === 'opened' && row.days_to_expiry !== null && row.days_to_expiry <= 15 && toNum(row.current_value) > toNum(row.accepted_value) && (
        <Notice tone={row.days_to_expiry < 0 ? 'bad' : 'warn'}>LC {row.days_to_expiry < 0 ? 'expired' : 'expires'} on {fmtDate(row.current_expiry)} with {fmtMoney(toNum(row.current_value) - toNum(row.accepted_value), row.currency)} not yet accepted.</Notice>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Export contract
const ContractPanel: FC<PanelProps> = ({ row }) => (
  <div>
    {toNum(row.btb_balance) < 0 && <Notice tone="bad">BTB (opened + awaiting approval) exceeds entitlement by {fmtMoney(-toNum(row.btb_balance), row.currency)}.</Notice>}
    {row.status === 'active' && row.days_to_lsd < 0 && toNum(row.balance_to_ship) > 0 && (
      <Notice tone="bad">Last shipment date {fmtDate(row.current_lsd)} has passed with {fmtMoney(row.balance_to_ship, row.currency)} unshipped. Amend or close.</Notice>)}
    {row.status === 'active' && row.days_to_expiry >= 0 && row.days_to_expiry <= 30 && <Notice>Expires in {row.days_to_expiry} days ({fmtDate(row.current_expiry)}).</Notice>}
  </div>
);

// ---------------------------------------------------------------- Export invoice: documents + draft BL check
async function loadInvoiceDocData(invoiceId: string): Promise<InvoiceDocData> {
  const invoice = (await fetchOne('v_export_invoices', invoiceId))!;
  const [items, contract] = await Promise.all([
    fetchRows('export_invoice_items', { filters: { invoice_id: invoiceId, status: { op: 'neq', value: 'void' } }, order: [{ column: 'created_at' }] }),
    fetchOne('v_export_contracts', invoice.contract_id),
  ]);
  const buyer = (await fetchOne('buyers', contract!.buyer_id))!;
  return { invoice, items, contract: contract!, buyer };
}

const norm = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

interface CheckLine { field: string; label: string; expected: string; draft: string; numeric?: boolean; manual?: boolean; result?: 'pass' | 'discrepancy'; note?: string }

const BlCheck: FC<{ invoiceId: string }> = ({ invoiceId }) => {
  const { company, canWrite } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const d = await loadInvoiceDocData(invoiceId);
    const checks = await fetchRows('bl_checks', { filters: { export_invoice_id: invoiceId, status: { op: 'neq', value: 'void' } }, order: [{ column: 'created_at', ascending: false }] });
    return { d, checks };
  }, [invoiceId]);
  const expected = useMemo<Omit<CheckLine, 'draft'>[]>(() => {
    if (!data) return [];
    const { invoice: i, items, contract: c } = data.d;
    const sum = (k: string) => items.reduce((s, r) => s + toNum(r[k]), 0);
    return [
      { field: 'shipper', label: 'Shipper', expected: company?.name ?? '' },
      { field: 'consignee', label: 'Consignee', expected: c.consignee_text ?? '' },
      { field: 'notify', label: 'Notify party', expected: c.notify_text ?? '' },
      { field: 'port_of_loading', label: 'Port of loading', expected: i.port_of_loading ?? '' },
      { field: 'port_of_discharge', label: 'Port of discharge', expected: i.port_of_discharge ?? '' },
      { field: 'description', label: 'Description of goods', expected: [...new Set(items.map((r) => r.description))].join('; ') },
      { field: 'cartons', label: 'No. of cartons', expected: String(sum('cartons')), numeric: true },
      { field: 'quantity', label: 'Quantity (Pcs)', expected: String(sum('quantity_pcs')), numeric: true },
      { field: 'gross_wt', label: 'Gross weight (kg)', expected: sum('gross_weight_kg').toFixed(3), numeric: true },
      { field: 'net_wt', label: 'Net weight (kg)', expected: sum('net_weight_kg').toFixed(3), numeric: true },
      { field: 'cbm', label: 'Measurement (CBM)', expected: sum('cbm').toFixed(3), numeric: true },
      { field: 'marks', label: 'Shipping marks', expected: i.shipping_marks ?? '' },
      { field: 'container', label: 'Container no.', expected: i.container_no ?? '' },
      { field: 'lc_ref', label: 'LC / contract no. & date', expected: `${c.contract_no} ${fmtDate(c.issue_date)}` },
      { field: 'freight', label: 'Freight clause (per LC)', expected: c.incoterm && ['FOB', 'FCA', 'EXW'].includes(c.incoterm) ? 'FREIGHT COLLECT' : 'FREIGHT PREPAID', manual: true },
      { field: 'on_board', label: `Shipped on board date ≤ LSD ${fmtDate(c.current_lsd)}`, expected: 'Yes', manual: true },
      { field: 'clean', label: 'Clean BL (no clauses on condition)', expected: 'Yes', manual: true },
    ];
  }, [data, company]);
  const [lines, setLines] = useState<CheckLine[] | null>(null);
  const [draftRef, setDraftRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const work = lines ?? expected.map((e) => ({ ...e, draft: '' }));

  const autoMatch = (l: CheckLine) => {
    if (!l.draft) return null;
    if (l.manual) return l.result ?? null;
    if (l.numeric) return Math.abs(toNum(l.draft) - toNum(l.expected)) < 0.0015;
    return norm(l.draft) === norm(l.expected) || (l.field === 'description' && norm(l.expected).includes(norm(l.draft)));
  };
  const resultOf = (l: CheckLine) => l.result ?? (autoMatch(l) === null ? undefined : autoMatch(l) ? 'pass' : 'discrepancy');
  const update = (idx: number, patch: Partial<CheckLine>) => setLines(work.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const overall = work.some((l) => resultOf(l) === 'discrepancy') ? 'discrepancy' : work.every((l) => resultOf(l) === 'pass') ? 'pass' : 'pending';

  async function save() {
    setSaveErr(null);
    try {
      check(await supabase.from('bl_checks').insert({
        export_invoice_id: invoiceId, check_date: todayISO(), draft_ref: draftRef || null, remarks: remarks || null, overall_result: overall,
        results: work.map((l) => ({ field: l.field, label: l.label, expected: l.expected, draft: l.draft, auto_match: autoMatch(l), result: resultOf(l) ?? 'pending', note: l.note ?? null })),
      }));
      setLines(null); setDraftRef(''); setRemarks(''); reload();
    } catch (e) { setSaveErr((e as Error).message); }
  }

  if (loading) return <Spinner />;
  return (
    <Card title="Draft BL / FCR check against invoice and LC terms">
      <ErrorBox error={error || saveErr} />
      {data?.checks[0] && (
        <Notice tone={data.checks[0].overall_result === 'pass' ? 'good' : data.checks[0].overall_result === 'discrepancy' ? 'bad' : 'info'}>
          Last check {fmtDate(data.checks[0].check_date)} ({data.checks[0].draft_ref ?? 'no ref'}): <b>{data.checks[0].overall_result}</b>
          {(data.checks[0].results as Row[]).filter((r) => r.result === 'discrepancy').map((r) => (
            <div key={r.field} className="text-xs">• {r.label}: draft “{r.draft}” vs expected “{r.expected}” {r.note ? `— ${r.note}` : ''}</div>))}
        </Notice>
      )}
      {canWrite('bl_checks') && (<>
        <p className="mb-2 text-xs text-slate-500">Type what the draft BL says. Text fields match ignoring spaces & punctuation; numbers within 0.001. Override any line.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1 pr-2">Field</th><th className="pr-2">Expected (from invoice / LC)</th><th className="pr-2">Draft BL says</th><th>Result</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {work.map((l, i) => {
                const r = resultOf(l);
                return (
                  <tr key={l.field} className="align-top">
                    <td className="py-1.5 pr-2 text-xs font-medium">{l.label}</td>
                    <td className="max-w-xs pr-2 text-xs text-slate-600 whitespace-pre-wrap">{l.numeric ? fmtNum(l.expected, l.field === 'cartons' || l.field === 'quantity' ? 0 : 3) : l.expected || '—'}</td>
                    <td className="pr-2">
                      {l.manual
                        ? <select className={inputCls} value={l.result ?? ''} onChange={(e) => update(i, { result: (e.target.value || undefined) as CheckLine['result'], draft: e.target.value })}>
                            <option value="">—</option><option value="pass">OK as per LC</option><option value="discrepancy">Not OK</option></select>
                        : <input className={inputCls} value={l.draft} onChange={(e) => update(i, { draft: e.target.value, result: undefined })} />}
                    </td>
                    <td className="whitespace-nowrap">
                      <select className={`${inputCls} w-36 ${r === 'discrepancy' ? 'border-red-400 text-red-700' : r === 'pass' ? 'border-emerald-400 text-emerald-700' : ''}`}
                        value={r ?? ''} onChange={(e) => update(i, { result: (e.target.value || undefined) as CheckLine['result'] })}>
                        <option value="">pending</option><option value="pass">✓ pass</option><option value="discrepancy">● discrepancy</option>
                      </select>
                      {r === 'discrepancy' && <input className={`${inputCls} mt-1`} placeholder="note" value={l.note ?? ''} onChange={(e) => update(i, { note: e.target.value })} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Field label="Draft BL / FCR ref."><input className={inputCls} value={draftRef} onChange={(e) => setDraftRef(e.target.value)} /></Field>
          <Field label="Remarks" span={2}><input className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className="text-sm">Overall: <b className={overall === 'pass' ? 'text-emerald-700' : overall === 'discrepancy' ? 'text-red-700' : 'text-amber-700'}>{overall}</b></span>
          <Button onClick={save}>Save BL check</Button>
        </div>
      </>)}
    </Card>
  );
};

const InvoicePanel: FC<PanelProps> = ({ row }) => {
  const { company } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (d: InvoiceDocData) => void) => loadInvoiceDocData(row.id).then((d) => {
    if (!d.items.length) throw new Error('Add invoice lines first');
    fn(d);
  }).catch((e) => setErr(e.message));
  return (
    <div className="mb-4 space-y-3">
      <ErrorBox error={err} />
      <Card title="Export documents (generated from contract & invoice data)">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => run((d) => commercialInvoicePdf(d, company))}>⬇ Commercial Invoice PDF</Button>
          <Button variant="secondary" onClick={() => run((d) => packingListPdf(d, company))}>⬇ Packing List PDF</Button>
          <Button variant="secondary" onClick={() => run((d) => invoiceDocsXlsx(d, company))}>⬇ Invoice + Packing List Excel</Button>
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-1 text-xs text-slate-600 sm:grid-cols-4">
          {[['EXP', row.exp_no], ['Shipping bill', row.shipping_bill_no], ['Port submission', row.port_submission_date], ['Handover to forwarder', row.handover_date],
            ['Draft BL received', row.draft_bl_received_date], ['Draft BL checked', row.bl_check_result], ['Final BL', row.bl_no], ['Submitted to bank', row.bill_ref_no]]
            .map(([l, v]) => <li key={l}>{v ? '✓' : '○'} {l}{v ? `: ${String(v).match(/^\d{4}-\d{2}-\d{2}/) ? fmtDate(v) : v}` : ''}</li>)}
        </ol>
      </Card>
      <BlCheck invoiceId={row.id} />
    </div>
  );
};

// ---------------------------------------------------------------- Export bill: attach invoices
const BillPanel: FC<PanelProps> = ({ row, reload }) => {
  const { canWrite } = useAuth();
  const { data, reload: reloadInv } = useAsync(() => fetchRows('v_export_invoices', {
    filters: { contract_id: row.contract_id, status: { op: 'neq', value: 'void' } }, order: [{ column: 'invoice_date' }] }), [row.id]);
  const [err, setErr] = useState<string | null>(null);
  if (!canWrite('export_invoices') || row.status === 'void') return null;
  const free = (data ?? []).filter((i) => !i.export_bill_id);
  const mine = (data ?? []).filter((i) => i.export_bill_id === row.id);
  const link = async (invoiceId: string, billId: string | null) => {
    setErr(null);
    try { check(await supabase.from('export_invoices').update({ export_bill_id: billId }).eq('id', invoiceId).select('id').single()); reloadInv(); reload(); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <Card title="Invoices in this bank submission" className="mb-4">
      <ErrorBox error={err} />
      <div className="flex flex-wrap gap-2">
        {mine.map((i) => <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs">
          {i.invoice_no} · {fmtMoney(i.invoice_value, i.currency)} <button className="text-red-600" title="Remove" onClick={() => link(i.id, null)}>✕</button></span>)}
        {!mine.length && <span className="text-sm text-slate-500">No invoices attached yet.</span>}
      </div>
      {free.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-slate-500">Add invoice of {row.contract_no}:</span>
          {free.map((i) => <Button key={i.id} small variant="secondary" onClick={() => link(i.id, row.id)}>+ {i.invoice_no} ({fmtMoney(i.invoice_value, i.currency)})</Button>)}
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------- Realization: link to Master LC
const RealizationPanel: FC<PanelProps> = ({ row }) => {
  const { data } = useAsync(() => fetchOne('v_export_contracts', row.contract_id), [row.contract_id]);
  return (
    <Notice tone="info">
      Proceeds of <Link className="font-semibold underline" to={`/r/export_contracts/${row.contract_id}`}>{row.contract_no}</Link>.
      BTB payments recorded under “BTB Payments from these Proceeds” settle acceptances of the same Master LC and reduce its open BTB liability
      {data && <> (now <b>{fmtMoney(data.open_btb_liability, data.currency)}</b>)</>}.
      {toNum(row.undistributed) > 0 && <> Undistributed: <b>{fmtMoney(row.undistributed, row.currency)}</b>.</>}
    </Notice>
  );
};

// ---------------------------------------------------------------- Incentive claim form
const ENCLOSURES: [string, string][] = [['doc_application', 'Application (Form-Ka)'], ['doc_invoice', 'Commercial invoice'], ['doc_packing_list', 'Packing list'],
  ['doc_exp', 'EXP form'], ['doc_bl', 'Bill of lading'], ['doc_prc', 'Proceeds realization certificate (PRC)'], ['doc_ud', 'Utilization declaration (UD)'],
  ['doc_input_certificate', 'Local input supplier certificate'], ['doc_auditor_cert', "Auditor's certificate"]];

export async function claimFormData(claim: Row, company: Row | null): Promise<Row> {
  const real = (await fetchOne('realizations', claim.realization_id))!;
  const invoiceIds = (await fetchRows('export_invoices', { select: 'id,status', filters: { export_bill_id: real.export_bill_id } })).map((r) => r.id);
  const [contract, items, bill] = await Promise.all([
    fetchOne('v_export_contracts', claim.contract_id),
    fetchRows('export_invoice_items', { select: 'description,quantity_pcs,status',
      filters: { status: { op: 'neq', value: 'void' }, invoice_id: { op: 'in', value: invoiceIds } } }),
    fetchOne('v_export_bills', real.export_bill_id),
  ]);
  const buyer = await fetchOne('buyers', contract!.buyer_id);
  const bank = await fetchOne('banks', contract!.lien_bank_id);
  const qty = items.reduce((s, r) => s + toNum(r.quantity_pcs), 0);
  const ccy = claim.currency;
  return {
    today: todayISO(),
    company: { ...company, name_address: `${company?.name ?? ''}, ${company?.address ?? ''}`, erc_bin: [company?.erc_no && `ERC ${company.erc_no}`, company?.bin && `BIN ${company.bin}`].filter(Boolean).join(' / ') },
    bank,
    contract: { ...contract, no_date: `${contract!.contract_no} dated ${fmtDate(contract!.issue_date)}`, value: fmtMoney(contract!.current_value, contract!.currency) },
    buyer: { ...buyer, name_address: `${buyer?.name ?? ''}, ${buyer?.address ?? ''}` },
    claim: {
      ...claim,
      goods: `${[...new Set(items.map((r) => r.description))].join('; ')} — ${fmtNum(qty, 0)} Pcs`,
      bl_date: fmtDate(claim.bl_date), bill_value: fmtMoney(bill?.bill_value, ccy),
      realized: `${fmtMoney(claim.realized_amount, ccy)} on ${fmtDate(claim.realization_date)} @ ${fmtNum(claim.exchange_rate, 4)}`,
      prc: claim.prc_no ? `${claim.prc_no} dated ${fmtDate(claim.prc_date)}` : '',
      base_amount: fmtMoney(claim.base_amount, ccy), scheme_rate: `${claim.scheme} @ ${fmtNum(claim.rate_pct, 3)}%`,
      claim_amount: fmtMoney(claim.claim_amount, ccy), claim_amount_bdt: fmtMoney(claim.claim_amount_bdt, 'BDT'),
    },
  };
}

const ClaimPanel: FC<PanelProps> = ({ row }) => {
  const { company, settings } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const tpl = settings['template.incentive_claim'] as ClaimTemplate | undefined;
  const enclosures = ENCLOSURES.filter(([k]) => row[k]).map(([, l]) => l);
  const go = (fn: (data: Row) => void) => claimFormData(row, company as unknown as Row).then(fn).catch((e) => setErr(e.message));
  return (
    <Card title="Claim form" className="mb-4">
      <ErrorBox error={err} />
      {!tpl ? <Notice>No claim template found in Settings.</Notice> : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => go((d) => incentiveClaimPdf(tpl, d, enclosures, company))}>⬇ Claim form PDF</Button>
          <Button variant="secondary" onClick={() => go((d) => incentiveClaimXlsx(tpl, d, enclosures))}>⬇ Claim form Excel</Button>
          <span className="self-center text-xs text-slate-500">Layout: Admin › Settings & Templates › Incentive claim</span>
        </div>
      )}
      <div className="mt-2 text-xs text-slate-600">Documents ticked: {enclosures.length} of {ENCLOSURES.length}{enclosures.length < ENCLOSURES.length && ` — missing: ${ENCLOSURES.filter(([k]) => !row[k]).map(([, l]) => l).join(', ')}`}</div>
    </Card>
  );
};

export const RECORD_PANELS: Record<string, FC<PanelProps>> = {
  import_lcs: ImportLcPanel,
  export_contracts: ContractPanel,
  export_invoices: InvoicePanel,
  export_bills: BillPanel,
  realizations: RealizationPanel,
  incentive_claims: ClaimPanel,
};
