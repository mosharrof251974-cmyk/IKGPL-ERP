import { Link, useNavigate } from 'react-router-dom';
import { Badge, Card, ErrorBox, Kpi, Meter, Notice, PageHeader, Spinner } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { fetchRows, useAsync, type Row } from '../lib/data';
import { useAuth } from '../lib/auth';
import { addDays, fmtCompact, fmtDate, fmtMoney, monthStart, todayISO, toNum } from '../lib/format';

const sum = (rows: Row[], k: string) => rows.reduce((s, r) => s + toNum(r[k]), 0);
const nv = { status: { op: 'neq' as const, value: 'void' } };

export async function loadDashboard() {
  const [contracts, lcs, acc, bills, invoices, ships, util, claims, alerts] = await Promise.all([
    fetchRows('v_export_contracts', { filters: nv }),
    fetchRows('v_import_lcs', { filters: nv }),
    fetchRows('v_acceptances', { filters: { ...nv, outstanding: { op: 'gt', value: 0 } }, order: [{ column: 'maturity_date' }] }),
    fetchRows('v_export_bills', { filters: nv }),
    fetchRows('v_export_invoices', { select: 'id,invoice_date,invoice_value_usd,status', filters: { ...nv, invoice_date: { op: 'gte', value: monthStart() } } }),
    fetchRows('v_import_shipments', { filters: { ...nv, demurrage_risk: { op: 'in', value: ['high', 'medium'] } } }),
    fetchRows('v_bank_utilization', { order: [{ column: 'bank_name' }, { column: 'facility_type' }] }),
    fetchRows('v_incentive_claims', { select: 'id,claim_status,claim_amount_bdt,received_amount_bdt,status', filters: nv }),
    fetchRows('v_alerts', { order: [{ column: 'due_date' }] }),
  ]);
  return { contracts, lcs, acc, bills, invoices, ships, util, claims, alerts };
}

export default function Dashboard() {
  const nav = useNavigate();
  const { isGM, profile } = useAuth();
  const { data, error, loading } = useAsync(loadDashboard, []);
  if (loading) return <Spinner />;
  if (!data) return <ErrorBox error={error} />;

  const today = todayISO();
  const active = data.contracts.filter((c) => c.status === 'active');
  const inHand = active.reduce((s, c) => s + Math.max(0, toNum(c.balance_to_ship_usd)), 0);
  const underReal = data.bills.filter((b) => ['under_realization', 'partly_realized'].includes(b.bill_status));
  const overdue = data.bills.filter((b) => b.bill_status === 'overdue');
  const openedThisMonth = data.lcs.filter((l) => l.opening_date && l.opening_date >= monthStart());
  const btbLiability = sum(data.lcs.filter((l) => l.is_btb), 'open_liability_usd');
  const pending = data.lcs.filter((l) => l.approval_status === 'pending');
  const bucket = (from: number | null, to: number) => data.acc.filter((a) => a.maturity_date
    && (from === null ? a.maturity_date < today : a.maturity_date >= addDays(today, from) && a.maturity_date <= addDays(today, to)));
  const buckets = [
    { label: 'Overdue', rows: bucket(null, 0) }, { label: 'Next 7 days', rows: bucket(0, 7) }, { label: '8 – 30 days', rows: bucket(8, 30) },
    { label: '31 – 60 days', rows: bucket(31, 60) }, { label: '61 – 90 days', rows: bucket(61, 90) },
  ];
  const maxBucket = Math.max(1, ...buckets.map((b) => sum(b.rows, 'outstanding_usd')));
  const claimed = sum(data.claims.filter((c) => c.claim_status !== 'not_claimed'), 'claim_amount_bdt');
  const received = sum(data.claims, 'received_amount_bdt');
  const expiries = data.alerts.filter((a) => ['export_lc_expiry', 'import_lc_expiry', 'export_lsd'].includes(a.alert_type));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`${fmtDate(today)} · amounts in USD equivalent · ${profile?.full_name ?? ''}`} />
      {isGM && pending.length > 0 && (
        <Notice tone="bad">{pending.length} BTB LC{pending.length > 1 ? 's' : ''} above entitlement waiting for your approval:{' '}
          {pending.map((l) => <Link key={l.id} className="mr-2 underline" to={`/r/import_lcs/${l.id}`}>{l.application_no ?? l.lc_no}</Link>)}</Notice>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Orders in hand" value={`$${fmtCompact(inHand)}`} sub={`${active.length} active Master LC / SC`} />
        <Kpi label="Shipped this month" value={`$${fmtCompact(sum(data.invoices, 'invoice_value_usd'))}`} sub={`${data.invoices.length} invoices`} />
        <Kpi label="Under realization" value={`$${fmtCompact(sum(underReal, 'outstanding_usd'))}`} sub={`${underReal.length} bills`} />
        <Kpi label="Overdue bills" value={`$${fmtCompact(sum(overdue, 'outstanding_usd'))}`} sub={`${overdue.length} bills`} tone={overdue.length ? 'bad' : undefined} />
        <Kpi label="Open BTB liability" value={`$${fmtCompact(btbLiability)}`} sub="accepted unpaid + unaccepted balance" />
        <Kpi label="Import LCs opened (month)" value={openedThisMonth.length} sub={`$${fmtCompact(sum(openedThisMonth, 'value_usd'))}`} />
        <Kpi label="Maturing ≤ 30 days" value={`$${fmtCompact(sum([...buckets[0].rows, ...buckets[1].rows, ...buckets[2].rows], 'outstanding_usd'))}`}
          sub={`${buckets[0].rows.length + buckets[1].rows.length + buckets[2].rows.length} acceptances`} tone={buckets[0].rows.length ? 'bad' : undefined} />
        <Kpi label="Demurrage risk" value={data.ships.length} sub="shipments at port beyond / near free time" tone={data.ships.some((s) => s.demurrage_risk === 'high') ? 'bad' : data.ships.length ? 'warn' : undefined} />
        <Kpi label="Incentive claimed" value={`৳${fmtCompact(claimed)}`} sub={`received ৳${fmtCompact(received)}`} />
        <Kpi label="LC / LSD alerts (30 days)" value={expiries.length} sub="export & import" tone={expiries.length ? 'warn' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Acceptance maturity profile (USD outstanding)" actions={<Link className="text-xs text-brand-600" to="/m/acceptances">Register →</Link>}>
          <ul className="space-y-2">
            {buckets.map((b) => {
              const v = sum(b.rows, 'outstanding_usd');
              return (
                <li key={b.label} className="grid grid-cols-[6.5rem_1fr_6rem] items-center gap-2 text-sm">
                  <span className="text-slate-600">{b.label}</span>
                  <div className="h-3 overflow-hidden rounded-r bg-slate-50" title={`${b.rows.length} acceptances`}>
                    <div className={`h-full rounded-r ${b.label === 'Overdue' ? 'bg-red-600' : 'bg-brand-500'}`} style={{ width: `${(v / maxBucket) * 100}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-slate-800">${fmtCompact(v)} <span className="text-xs text-slate-500">({b.rows.length})</span></span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Bank limits vs utilization" actions={<Link className="text-xs text-brand-600" to="/bank-utilization">Report →</Link>}>
          <ul className="space-y-2.5">
            {data.util.map((u) => (
              <li key={u.id} className="text-sm">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-700">{u.facility_type} <span className="text-slate-400">{u.is_funded ? 'funded' : 'non-funded'} · {u.bank_name}</span></span>
                  <span className="tabular-nums text-slate-600">{fmtMoney(u.utilized, u.currency, 0)} / {fmtMoney(u.limit_amount, u.currency, 0)}</span>
                </div>
                <Meter pct={u.utilization_pct === null ? null : Number(u.utilization_pct)} />
              </li>
            ))}
            {!data.util.length && <li className="text-sm text-slate-500">No facilities set up (Masters › Banks).</li>}
          </ul>
        </Card>

        <Card title="Maturities in the next 30 days">
          <DataTable compact exportName="Maturities next 30 days" rows={[...buckets[0].rows, ...buckets[1].rows, ...buckets[2].rows]}
            onRowClick={(r) => nav(`/r/acceptances/${r.id}`)}
            columns={[{ key: 'maturity_date', label: 'Maturity', type: 'date' }, { key: 'lc_no', label: 'LC' }, { key: 'supplier_name', label: 'Supplier' },
              { key: 'currency', label: 'Ccy' }, { key: 'outstanding', label: 'Outstanding', type: 'money' }, { key: 'days_to_maturity', label: 'Days', type: 'int' }]} />
        </Card>

        <Card title="LC expiries & last shipment dates">
          <DataTable compact exportName="LC expiries" rows={expiries} onRowClick={(r) => nav(`/r/${r.ref_table}/${r.ref_id}`)}
            columns={[{ key: 'due_date', label: 'Date', type: 'date' }, { key: 'alert_type', label: 'Type', type: 'status' }, { key: 'ref_no', label: 'Ref.' },
              { key: 'title', label: 'Detail' }, { key: 'days_left', label: 'Days', type: 'int' }]} />
        </Card>

        <Card title="Overdue & under-realization bills" actions={<Link className="text-xs text-brand-600" to="/m/export_bills">Bills →</Link>}>
          <DataTable compact exportName="Bills under realization" rows={[...overdue, ...underReal]} onRowClick={(r) => nav(`/r/export_bills/${r.id}`)}
            columns={[{ key: 'bill_ref_no', label: 'Bill' }, { key: 'buyer_name', label: 'Buyer' }, { key: 'due_date', label: 'Due', type: 'date' },
              { key: 'currency', label: 'Ccy' }, { key: 'outstanding', label: 'Outstanding', type: 'money' }, { key: 'bill_status', label: 'Status', type: 'status' }]} />
        </Card>

        <Card title="Demurrage risk" actions={<Link className="text-xs text-brand-600" to="/m/import_shipments">Shipments →</Link>}>
          {data.ships.length === 0 ? <p className="text-sm text-slate-500">No shipments at risk.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.ships.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link className="font-medium text-brand-700" to={`/r/import_shipments/${s.id}`}>{s.bl_awb_no ?? s.lc_no}</Link>
                  <span className="text-slate-600">{s.supplier_name} · {s.port}</span>
                  <span className="text-xs text-slate-500">arrived {fmtDate(s.arrival_date)} · {s.days_since_arrival} days (free {s.free_days})</span>
                  <span className="ml-auto"><Badge value={s.demurrage_risk} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
