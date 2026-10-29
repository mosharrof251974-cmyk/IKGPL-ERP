import { useState } from 'react';
import { jsPDF } from 'jspdf';
import { DataTable } from '../components/DataTable';
import { Button, Card, ErrorBox, Field, PageHeader, Spinner, inputCls } from '../components/ui';
import { fetchRows, useAsync, type Row } from '../lib/data';
import { useAuth } from '../lib/auth';
import { addTable, exportXlsx, letterhead, pageFooter, type Sheet } from '../lib/exporters';
import { addDays, fmtDate, monthEnd, monthStart, todayISO, toNum } from '../lib/format';
import { UTIL_COLUMNS } from './Reports';

const nv = { status: { op: 'neq' as const, value: 'void' } };
async function inPeriod(source: string, col: string, from: string, to: string, extra: Record<string, unknown> = {}) {
  const rows = await fetchRows(source, { filters: { ...nv, ...extra, [col]: { op: 'gte', value: from } }, order: [{ column: col }] });
  return rows.filter((r) => String(r[col]).slice(0, 10) <= to);
}

async function buildPack(from: string, to: string): Promise<Sheet[]> {
  const today = todayISO();
  const [contracts, newContracts, invoices, bills, allBills, reals, lcs, newLcs, pays, acc, util, claimsSub, claimsRecv] = await Promise.all([
    fetchRows('v_export_contracts', { filters: { ...nv, status: 'active' }, order: [{ column: 'buyer_name' }] }),
    inPeriod('v_export_contracts', 'issue_date', from, to),
    inPeriod('v_export_invoices', 'invoice_date', from, to),
    inPeriod('v_export_bills', 'submission_date', from, to),
    fetchRows('v_export_bills', { filters: nv }),
    inPeriod('v_realizations', 'realization_date', from, to),
    fetchRows('v_import_lcs', { filters: nv }),
    inPeriod('v_import_lcs', 'opening_date', from, to),
    inPeriod('v_import_payments', 'payment_date', from, to),
    fetchRows('v_acceptances', { filters: { ...nv, outstanding: { op: 'gt', value: 0 } }, order: [{ column: 'maturity_date' }] }),
    fetchRows('v_bank_utilization', { order: [{ column: 'bank_name' }, { column: 'facility_type' }] }),
    inPeriod('v_incentive_claims', 'submission_date', from, to),
    inPeriod('v_incentive_claims', 'received_date', from, to),
  ]);
  const s = (rows: Row[], k: string) => rows.reduce((a, r) => a + toNum(r[k]), 0);
  const overdue = allBills.filter((b) => b.bill_status === 'overdue');
  const underReal = allBills.filter((b) => ['under_realization', 'partly_realized'].includes(b.bill_status));
  const mat = (d1: number, d2: number) => acc.filter((a) => a.maturity_date && a.maturity_date >= addDays(today, d1) && a.maturity_date <= addDays(today, d2));
  const summary: Row[] = [
    { item: 'Orders in hand (balance to ship, active Master LC / SC)', usd: s(contracts, 'balance_to_ship_usd') },
    { item: 'New Master LC / SC received in period', usd: s(newContracts, 'value_usd'), count: newContracts.length },
    { item: 'Shipped in period (invoice value)', usd: s(invoices, 'invoice_value_usd'), count: invoices.length },
    { item: 'Export documents submitted to bank in period', usd: s(bills, 'bill_value_usd'), count: bills.length },
    { item: 'Proceeds realized in period', usd: s(reals, 'realized_usd'), count: reals.length },
    { item: 'Bills under realization (not yet due)', usd: s(underReal, 'outstanding_usd'), count: underReal.length },
    { item: 'Overdue export bills', usd: s(overdue, 'outstanding_usd'), count: overdue.length },
    { item: 'Import / BTB LCs opened in period', usd: s(newLcs, 'value_usd'), count: newLcs.length },
    { item: 'Import payments made in period (BDT)', bdt: s(pays, 'amount_bdt'), count: pays.length },
    { item: 'Open BTB liability (as on today)', usd: s(lcs.filter((l) => l.is_btb), 'open_liability_usd') },
    { item: 'Acceptances overdue (unpaid past maturity)', usd: s(acc.filter((a) => a.maturity_date < today), 'outstanding_usd') },
    { item: 'Acceptances maturing in next 7 days', usd: s(mat(0, 7), 'outstanding_usd'), count: mat(0, 7).length },
    { item: 'Acceptances maturing in next 30 days', usd: s(mat(0, 30), 'outstanding_usd'), count: mat(0, 30).length },
    { item: 'Acceptances maturing in next 60 days', usd: s(mat(0, 60), 'outstanding_usd'), count: mat(0, 60).length },
    { item: 'Acceptances maturing in next 90 days', usd: s(mat(0, 90), 'outstanding_usd'), count: mat(0, 90).length },
    { item: 'Cash incentive claimed in period (BDT)', bdt: s(claimsSub, 'claim_amount_bdt'), count: claimsSub.length },
    { item: 'Cash incentive received in period (BDT)', bdt: s(claimsRecv, 'received_amount_bdt'), count: claimsRecv.length },
  ];
  return [
    { name: 'Summary', title: '1. Key figures', columns: [{ key: 'item', label: 'Item' }, { key: 'count', label: 'Count', type: 'int' },
      { key: 'usd', label: 'USD (equivalent)', type: 'money' }, { key: 'bdt', label: 'BDT', type: 'money' }], rows: summary },
    { name: 'Orders in hand', title: '2. Orders in hand & BTB position by Master LC / SC', totals: ['current_value', 'shipped_value', 'balance_to_ship', 'btb_opened', 'open_btb_liability'],
      columns: [{ key: 'contract_no', label: 'LC / SC' }, { key: 'buyer_name', label: 'Buyer' }, { key: 'currency', label: 'Ccy' },
        { key: 'current_value', label: 'Value', type: 'money' }, { key: 'shipped_value', label: 'Shipped', type: 'money' },
        { key: 'balance_to_ship', label: 'Balance', type: 'money' }, { key: 'current_lsd', label: 'LSD', type: 'date' },
        { key: 'btb_entitlement', label: 'BTB Entitled', type: 'money' }, { key: 'btb_opened', label: 'BTB Opened', type: 'money' },
        { key: 'open_btb_liability', label: 'Open BTB Liab.', type: 'money' }], rows: contracts },
    { name: 'New contracts', title: '3. Master LC / SC received in period', totals: ['value'],
      columns: [{ key: 'contract_no', label: 'LC / SC' }, { key: 'contract_type', label: 'Type' }, { key: 'buyer_name', label: 'Buyer' },
        { key: 'issue_date', label: 'Date', type: 'date' }, { key: 'currency', label: 'Ccy' }, { key: 'value', label: 'Value', type: 'money' },
        { key: 'current_lsd', label: 'LSD', type: 'date' }], rows: newContracts },
    { name: 'Shipments', title: '4. Shipments in period', totals: ['quantity_pcs', 'invoice_value'],
      columns: [{ key: 'invoice_no', label: 'Invoice' }, { key: 'invoice_date', label: 'Date', type: 'date' }, { key: 'contract_no', label: 'LC / SC' },
        { key: 'buyer_name', label: 'Buyer' }, { key: 'exp_no', label: 'EXP' }, { key: 'quantity_pcs', label: 'Pcs', type: 'int' },
        { key: 'currency', label: 'Ccy' }, { key: 'invoice_value', label: 'Value', type: 'money' }, { key: 'bl_date', label: 'BL Date', type: 'date' }], rows: invoices },
    { name: 'Realizations', title: '5. Proceeds realized in period', totals: ['bill_value', 'realized_amount', 'deductions_total', 'btb_paid'],
      columns: [{ key: 'realization_date', label: 'Date', type: 'date' }, { key: 'bill_ref_no', label: 'Bill' }, { key: 'contract_no', label: 'LC / SC' },
        { key: 'buyer_name', label: 'Buyer' }, { key: 'currency', label: 'Ccy' }, { key: 'bill_value', label: 'Bill Value', type: 'money' },
        { key: 'realized_amount', label: 'Realized', type: 'money' }, { key: 'deductions_total', label: 'Deductions', type: 'money' },
        { key: 'btb_paid', label: 'BTB Paid', type: 'money' }], rows: reals },
    { name: 'Overdue bills', title: '6. Export bills overdue / under realization (as on today)', totals: ['bill_value', 'outstanding'],
      columns: [{ key: 'bill_ref_no', label: 'Bill' }, { key: 'contract_no', label: 'LC / SC' }, { key: 'buyer_name', label: 'Buyer' },
        { key: 'submission_date', label: 'Submitted', type: 'date' }, { key: 'due_date', label: 'Due', type: 'date' }, { key: 'currency', label: 'Ccy' },
        { key: 'bill_value', label: 'Bill Value', type: 'money' }, { key: 'outstanding', label: 'Outstanding', type: 'money' },
        { key: 'days_overdue', label: 'Days Overdue', type: 'int' }, { key: 'bill_status', label: 'Status', type: 'status' }], rows: [...overdue, ...underReal] },
    { name: 'Import LCs opened', title: '7. Import / BTB LCs opened in period', totals: ['current_value'],
      columns: [{ key: 'lc_no', label: 'LC No.' }, { key: 'opening_date', label: 'Opened', type: 'date' }, { key: 'supplier_name', label: 'Supplier' },
        { key: 'contract_no', label: 'Master LC' }, { key: 'payment_type', label: 'Type', type: 'status' }, { key: 'currency', label: 'Ccy' },
        { key: 'current_value', label: 'Value', type: 'money' }, { key: 'bank_name', label: 'Bank' }], rows: newLcs },
    { name: 'Import payments', title: '8. Import / BTB payments in period', totals: ['amount', 'amount_bdt'],
      columns: [{ key: 'payment_date', label: 'Date', type: 'date' }, { key: 'lc_no', label: 'LC No.' }, { key: 'supplier_name', label: 'Supplier' },
        { key: 'currency', label: 'Ccy' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'amount_bdt', label: 'BDT', type: 'money' },
        { key: 'source', label: 'Source', type: 'status' }], rows: pays },
    { name: 'Maturities 90d', title: '9. Acceptances maturing in the next 90 days (and overdue)', totals: ['outstanding'],
      columns: [{ key: 'maturity_date', label: 'Maturity', type: 'date' }, { key: 'lc_no', label: 'LC No.' }, { key: 'supplier_name', label: 'Supplier' },
        { key: 'contract_no', label: 'Master LC' }, { key: 'currency', label: 'Ccy' }, { key: 'outstanding', label: 'Outstanding', type: 'money' },
        { key: 'days_to_maturity', label: 'Days', type: 'int' }], rows: acc.filter((a) => a.maturity_date && a.maturity_date <= addDays(today, 90)) },
    { name: 'Bank utilization', title: '10. Bank facility limits vs utilization (as on today)', columns: UTIL_COLUMNS, rows: util },
    { name: 'Incentive', title: '11. Cash incentive claims submitted / received in period', totals: ['claim_amount_bdt', 'received_amount_bdt'],
      columns: [{ key: 'claim_no', label: 'Claim' }, { key: 'scheme', label: 'Scheme' }, { key: 'contract_no', label: 'LC / SC' },
        { key: 'submission_date', label: 'Submitted', type: 'date' }, { key: 'claim_amount_bdt', label: 'Claimed BDT', type: 'money' },
        { key: 'received_date', label: 'Received', type: 'date' }, { key: 'received_amount_bdt', label: 'Received BDT', type: 'money' },
        { key: 'claim_status', label: 'Status', type: 'status' }], rows: [...new Map([...claimsSub, ...claimsRecv].map((c) => [c.id, c])).values()] },
  ];
}

export default function BoardPack() {
  const { company } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [run, setRun] = useState(0);
  const { data, error, loading } = useAsync(() => buildPack(from, to), [run]);
  const period = `${fmtDate(from)} to ${fmtDate(to)}`;

  function pdf() {
    if (!data) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let y = letterhead(doc, company, 'MONTHLY BOARD PACK — COMMERCIAL', `Period: ${period}   ·   Prepared ${fmtDate(todayISO())}`);
    data.forEach((sh) => {
      if (y > 150) { doc.addPage(); y = 14; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 58, 95);
      doc.text(sh.title ?? sh.name, 10, y + 4); doc.setTextColor(20);
      y = addTable(doc, sh, y + 6) + 6;
    });
    pageFooter(doc);
    doc.save(`Board Pack ${from} to ${to}.pdf`);
  }

  return (
    <div>
      <PageHeader title="Monthly Board Pack" subtitle="Everything below is generated from live data for the selected period"
        actions={data && <>
          <Button onClick={pdf}>⬇ Board Pack PDF</Button>
          <Button variant="secondary" onClick={() => exportXlsx(`Board Pack ${from} to ${to}`, data.map((s) => ({ ...s, subtitle: `Period: ${period}` })))}>⬇ Board Pack Excel</Button>
        </>} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button onClick={() => setRun((x) => x + 1)}>Build</Button>
          {[0, 1, 2].map((m) => {
            const d = new Date(todayISO() + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - m);
            const iso = d.toISOString().slice(0, 10);
            return <Button key={m} small variant="ghost" onClick={() => { setFrom(monthStart(iso)); setTo(monthEnd(iso)); setRun((x) => x + 1); }}>
              {d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</Button>;
          })}
        </div>
      </Card>
      <ErrorBox error={error} />
      {loading ? <Spinner /> : data?.map((sh) => (
        <Card key={sh.name} title={sh.title} className="mb-4">
          <DataTable columns={sh.columns} rows={sh.rows} exportName={`${sh.name} ${from} to ${to}`} title={sh.title} totals={sh.totals} compact />
        </Card>
      ))}
    </div>
  );
}
