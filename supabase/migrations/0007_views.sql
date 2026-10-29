-- =====================================================================
-- 0007 REPORTING VIEWS (all phases) + bank loans (PC / EDF) + alert log
-- Every figure on a register, dashboard or report comes from here.
-- Views run with the caller's rights (security_invoker) so RLS applies.
-- =====================================================================

-- Funded loans that count against PC / EDF limits (Phase 4)
create table public.bank_loans (
  id              uuid primary key default gen_random_uuid(),
  bank_id         uuid not null references public.banks (id),
  loan_type       public.facility_type not null check (loan_type in ('PC', 'EDF', 'OTHER')),
  loan_ref        text not null,
  contract_id     uuid references public.export_contracts (id),
  import_payment_id uuid references public.import_payments (id),   -- EDF used to pay a BTB
  loan_date       date not null,
  currency        text not null references public.currencies (code),
  amount          numeric(18,2) not null check (amount > 0),
  due_date        date,
  remarks         text,
  unique (bank_id, loan_ref)
);
select app.setup_table('bank_loans', array['active','void']);

create table public.loan_repayments (
  id              uuid primary key default gen_random_uuid(),
  loan_id         uuid not null references public.bank_loans (id),
  repayment_date  date not null,
  amount          numeric(18,2) not null check (amount > 0),
  realization_id  uuid references public.realizations (id),
  remarks         text
);
select app.setup_table('loan_repayments', array['active','void']);

create table public.alert_log (
  id          bigint generated always as identity primary key,
  sent_at     timestamptz not null default now(),
  channel     text not null default 'email',
  recipients  text[] not null,
  alert_count int not null,
  status      text not null,
  detail      text
);
alter table public.alert_log enable row level security;

-- ---------------------------------------------------------------------
create view public.v_import_lcs with (security_invoker = true) as
select l.*,
       (l.contract_id is not null)          as is_btb,
       s.name                               as supplier_name,
       s.origin                             as supplier_origin,
       bk.name                              as bank_name,
       c.contract_no,
       c.currency                           as contract_currency,
       by_.name                             as buyer_name,
       cur.current_value, cur.current_lsd, cur.current_expiry,
       coalesce(pi.pi_value, 0)             as pi_value,
       coalesce(ac.accepted_value, 0)       as accepted_value,
       coalesce(pp.paid_value, 0)           as paid_value,
       coalesce(ac.accepted_value, 0) - coalesce(pp.paid_value, 0) as accepted_unpaid,
       ub.unaccepted_balance,
       case when l.status = 'void' then 0
            else coalesce(ac.accepted_value, 0) - coalesce(pp.paid_value, 0) + ub.unaccepted_balance end
                                            as open_liability,
       app.convert(case when l.status = 'void' then 0
            else coalesce(ac.accepted_value, 0) - coalesce(pp.paid_value, 0) + ub.unaccepted_balance end,
            l.currency, 'USD')              as open_liability_usd,
       app.convert(cur.current_value, l.currency, 'USD', coalesce(l.opening_date, l.application_date)) as value_usd,
       cur.current_expiry - app.today()     as days_to_expiry
  from public.import_lcs l
  join public.suppliers s on s.id = l.supplier_id
  join public.banks bk on bk.id = l.bank_id
  left join public.export_contracts c on c.id = l.contract_id
  left join public.buyers by_ on by_.id = c.buyer_id
  cross join lateral app.import_lc_current(l.id) cur
  left join lateral (
    select sum(x.amount) as pi_value from public.proforma_invoices p
      join public.pi_items x on x.pi_id = p.id and x.status <> 'void'
     where p.import_lc_id = l.id and p.status <> 'void') pi on true
  left join lateral (
    select sum(document_value) as accepted_value from public.acceptances
     where import_lc_id = l.id and status <> 'void') ac on true
  left join lateral (
    select sum(p.amount) as paid_value from public.import_payments p
      join public.acceptances a on a.id = p.acceptance_id
     where a.import_lc_id = l.id and p.status <> 'void' and a.status <> 'void') pp on true
  cross join lateral (
    select case when l.status = 'opened' and coalesce(cur.current_expiry, app.today()) >= app.today()
                then greatest(cur.current_value - coalesce(ac.accepted_value, 0), 0) else 0 end
             as unaccepted_balance) ub;

-- ---------------------------------------------------------------------
create view public.v_export_invoices with (security_invoker = true) as
select i.*,
       c.contract_no, c.currency, c.buyer_id, b.name as buyer_name,
       coalesce(t.qty, 0) as quantity_pcs, coalesce(t.value, 0) as invoice_value,
       coalesce(t.cartons, 0) as total_cartons, coalesce(t.nw, 0) as total_net_wt,
       coalesce(t.gw, 0) as total_gross_wt, coalesce(t.cbm, 0) as total_cbm,
       eb.bill_ref_no, eb.submission_date as bank_submission_date,
       blc.overall_result as bl_check_result, blc.check_date as bl_check_date,
       app.convert(coalesce(t.value, 0), c.currency, 'USD', i.invoice_date) as invoice_value_usd,
       app.export_bond_date(i) as shipment_date
  from public.export_invoices i
  join public.export_contracts c on c.id = i.contract_id
  join public.buyers b on b.id = c.buyer_id
  left join public.export_bills eb on eb.id = i.export_bill_id and eb.status <> 'void'
  left join lateral (
    select sum(quantity_pcs) qty, sum(amount) value, sum(cartons) cartons,
           sum(net_weight_kg) nw, sum(gross_weight_kg) gw, sum(cbm) cbm
      from public.export_invoice_items where invoice_id = i.id and status <> 'void') t on true
  left join lateral (
    select overall_result, check_date from public.bl_checks
     where export_invoice_id = i.id and status <> 'void'
     order by check_date desc, created_at desc limit 1) blc on true;

-- ---------------------------------------------------------------------
create view public.v_export_bills with (security_invoker = true) as
with base as (
  select b.*,
         c.contract_no, c.currency, c.tenor_days, c.tenor_basis, c.buyer_id,
         by_.name as buyer_name, bk.name as bank_name,
         coalesce(inv.bill_value, 0) as bill_value,
         inv.invoice_nos, inv.exp_nos, inv.bl_date,
         coalesce(rz.realized, 0) as realized_amount,
         coalesce(rz.deductions, 0) as deductions,
         coalesce(rz.is_final, false) as is_closed,
         rz.last_realization_date
    from public.export_bills b
    join public.export_contracts c on c.id = b.contract_id
    join public.buyers by_ on by_.id = c.buyer_id
    join public.banks bk on bk.id = b.bank_id
    left join lateral (
      select sum(vi.invoice_value) as bill_value,
             string_agg(vi.invoice_no, ', ' order by vi.invoice_no) as invoice_nos,
             string_agg(vi.exp_no, ', ' order by vi.invoice_no) as exp_nos,
             max(vi.bl_date) as bl_date
        from public.v_export_invoices vi
       where vi.export_bill_id = b.id and vi.status <> 'void') inv on true
    left join lateral (
      select sum(r.realized_amount) realized,
             sum((select coalesce(sum(d.amount), 0) from public.realization_deductions d
                   where d.realization_id = r.id and d.status <> 'void')) deductions,
             bool_or(r.is_final) is_final,
             max(r.realization_date) last_realization_date
        from public.realizations r
       where r.export_bill_id = b.id and r.status <> 'void') rz on true
)
select base.*,
       due.due_date,
       base.bill_value - base.realized_amount as outstanding,
       case when base.is_closed then base.bill_value - base.realized_amount else 0 end as short_realization,
       case when base.status = 'void' then 'void'
            when base.is_closed then 'realized'
            when due.due_date is not null and due.due_date < app.today() then 'overdue'
            when base.realized_amount > 0 then 'partly_realized'
            else 'under_realization' end as bill_status,
       case when not base.is_closed and due.due_date < app.today()
            then app.today() - due.due_date else 0 end as days_overdue,
       app.convert(base.bill_value, base.currency, 'USD', base.submission_date) as bill_value_usd,
       app.convert(base.bill_value - base.realized_amount, base.currency, 'USD') as outstanding_usd
  from base
  cross join lateral (
    select (case base.tenor_basis
              when 'bl_date' then base.bl_date
              when 'submission_date' then base.submission_date
              else base.buyer_acceptance_date end) + base.tenor_days as due_date) due;

-- ---------------------------------------------------------------------
create view public.v_export_contracts with (security_invoker = true) as
select c.*,
       b.name   as buyer_name,
       ib.name  as issuing_bank_name,
       lb.name  as lien_bank_name,
       cur.current_value, cur.current_qty, cur.current_lsd, cur.current_expiry, cur.current_tolerance,
       round(cur.current_value * (1 + cur.current_tolerance / 100), 2) as max_value,
       round(cur.current_value * c.btb_entitlement_pct / 100, 2)       as btb_entitlement,
       coalesce(btb.opened, 0)                                          as btb_opened,
       coalesce(btb.pending, 0)                                         as btb_pending,
       round(cur.current_value * c.btb_entitlement_pct / 100, 2)
         - coalesce(btb.opened, 0) - coalesce(btb.pending, 0)           as btb_balance,
       coalesce(btb.liability, 0)                                       as open_btb_liability,
       coalesce(sh.shipped_value, 0)                                    as shipped_value,
       coalesce(sh.shipped_qty, 0)                                      as shipped_qty,
       cur.current_value - coalesce(sh.shipped_value, 0)                as balance_to_ship,
       coalesce(rz.realized, 0)                                         as realized_value,
       ud.ud_no, ud.ud_date,
       cur.current_expiry - app.today()                                 as days_to_expiry,
       cur.current_lsd - app.today()                                    as days_to_lsd,
       app.convert(cur.current_value, c.currency, 'USD')                as value_usd,
       app.convert(cur.current_value - coalesce(sh.shipped_value, 0), c.currency, 'USD') as balance_to_ship_usd,
       app.convert(coalesce(btb.liability, 0), c.currency, 'USD')       as open_btb_liability_usd
  from public.export_contracts c
  join public.buyers b on b.id = c.buyer_id
  left join public.banks ib on ib.id = c.issuing_bank_id
  join public.banks lb on lb.id = c.lien_bank_id
  cross join lateral app.contract_current(c.id) cur
  left join lateral (
    select sum(app.convert(v.current_value, v.currency, c.currency, coalesce(v.opening_date, v.application_date)))
             filter (where v.status in ('opened', 'closed')) as opened,
           sum(app.convert(v.current_value, v.currency, c.currency, coalesce(v.opening_date, v.application_date)))
             filter (where v.status = 'draft') as pending,
           sum(app.convert(v.open_liability, v.currency, c.currency)) as liability
      from public.v_import_lcs v where v.contract_id = c.id and v.status <> 'void') btb on true
  left join lateral (
    select sum(invoice_value) shipped_value, sum(quantity_pcs) shipped_qty
      from public.v_export_invoices where contract_id = c.id and status <> 'void') sh on true
  left join lateral (
    select sum(r.realized_amount) realized from public.realizations r
      join public.export_bills eb on eb.id = r.export_bill_id
     where eb.contract_id = c.id and r.status <> 'void' and eb.status <> 'void') rz on true
  left join lateral (
    select ud_no, ud_date from public.uds where contract_id = c.id and status <> 'void'
     order by ud_date desc limit 1) ud on true;

-- ---------------------------------------------------------------------
create view public.v_acceptances with (security_invoker = true) as
select a.*,
       l.lc_no, l.currency, l.payment_type, l.tenor_days, l.tenor_basis, l.contract_id,
       s.name as supplier_name, bk.name as bank_name, c.contract_no,
       coalesce(p.paid, 0) as paid_amount,
       a.document_value - coalesce(p.paid, 0) as outstanding,
       app.convert(a.document_value - coalesce(p.paid, 0), l.currency, 'USD') as outstanding_usd,
       a.maturity_date - app.today() as days_to_maturity,
       case when a.status = 'void' then 'void'
            when coalesce(p.paid, 0) >= a.document_value then 'paid'
            when coalesce(p.paid, 0) > 0 then 'partly_paid'
            when a.acceptance_date is null and l.tenor_days > 0 then 'awaiting_acceptance'
            when a.maturity_date < app.today() then 'overdue'
            else 'unpaid' end as payment_status
  from public.acceptances a
  join public.import_lcs l on l.id = a.import_lc_id
  join public.suppliers s on s.id = l.supplier_id
  join public.banks bk on bk.id = l.bank_id
  left join public.export_contracts c on c.id = l.contract_id
  left join lateral (
    select sum(amount) paid from public.import_payments
     where acceptance_id = a.id and status <> 'void') p on true;

create view public.v_import_payments with (security_invoker = true) as
select p.*,
       a.supplier_invoice_no, a.maturity_date, l.id as import_lc_id, l.lc_no, l.currency,
       s.name as supplier_name, bk.name as bank_name, c.contract_no,
       eb.bill_ref_no as realization_bill_ref, r.realization_date
  from public.import_payments p
  join public.acceptances a on a.id = p.acceptance_id
  join public.import_lcs l on l.id = a.import_lc_id
  join public.suppliers s on s.id = l.supplier_id
  join public.banks bk on bk.id = l.bank_id
  left join public.export_contracts c on c.id = l.contract_id
  left join public.realizations r on r.id = p.realization_id
  left join public.export_bills eb on eb.id = r.export_bill_id;

-- ---------------------------------------------------------------------
create view public.v_import_shipments with (security_invoker = true) as
select s.*,
       l.lc_no, l.contract_id, sp.name as supplier_name, cf.name as cf_agent_name,
       case when s.arrival_date is null then null
            else coalesce(s.release_date, app.today()) - s.arrival_date end as days_since_arrival,
       case when s.status = 'void' then null
            when s.release_date is not null then 'released'
            when s.arrival_date is null then 'in_transit'
            when app.today() - s.arrival_date > s.free_days then 'high'
            when app.today() - s.arrival_date >= greatest(s.free_days - 2, 0) then 'medium'
            else 'low' end as demurrage_risk,
       (s.doc_invoice::int + s.doc_packing_list::int + s.doc_bl_awb::int + s.doc_coo::int
        + s.doc_insurance::int + s.doc_test_cert::int) as docs_received
  from public.import_shipments s
  join public.import_lcs l on l.id = s.import_lc_id
  join public.suppliers sp on sp.id = l.supplier_id
  left join public.cf_agents cf on cf.id = s.cf_agent_id;

create view public.v_goods_receipts with (security_invoker = true) as
select g.*, l.lc_no, sp.name as supplier_name, s.bill_of_entry_no, s.bill_of_entry_date,
       (select count(*) from public.grn_items gi where gi.grn_id = g.id and gi.status <> 'void') as line_count
  from public.goods_receipts g
  join public.import_lcs l on l.id = g.import_lc_id
  join public.suppliers sp on sp.id = l.supplier_id
  left join public.import_shipments s on s.id = g.import_shipment_id;

-- LC quantity (from PIs) vs received quantity (from GRNs), per LC and item
create view public.v_lc_item_receipts with (security_invoker = true) as
with lcq as (
  select p.import_lc_id, x.item_id, x.unit_code, sum(x.quantity) as lc_qty
    from public.proforma_invoices p
    join public.pi_items x on x.pi_id = p.id and x.status <> 'void'
   where p.status <> 'void' and p.import_lc_id is not null
   group by 1, 2, 3
), rcv as (
  select g.import_lc_id, gi.item_id, sum(gi.quantity) as received_qty
    from public.goods_receipts g
    join public.grn_items gi on gi.grn_id = g.id and gi.status <> 'void'
   where g.status <> 'void'
   group by 1, 2
)
select coalesce(lcq.import_lc_id, rcv.import_lc_id) as import_lc_id,
       l.lc_no, it.id as item_id, it.name as item_name,
       coalesce(lcq.unit_code, it.unit_code) as unit_code,
       coalesce(lcq.lc_qty, 0) as lc_qty, coalesce(rcv.received_qty, 0) as received_qty,
       coalesce(rcv.received_qty, 0) - coalesce(lcq.lc_qty, 0) as short_excess
  from lcq full join rcv on rcv.import_lc_id = lcq.import_lc_id and rcv.item_id = lcq.item_id
  join public.import_lcs l on l.id = coalesce(lcq.import_lc_id, rcv.import_lc_id)
  join public.items it on it.id = coalesce(lcq.item_id, rcv.item_id);

-- ---------------------------------------------------------------------
create view public.v_realizations with (security_invoker = true) as
select r.*,
       b.bill_ref_no, b.bill_type, b.contract_id, b.contract_no, b.buyer_name, b.currency,
       b.bill_value, b.invoice_nos, b.bank_name,
       coalesce(d.total, 0) as deductions_total,
       coalesce(bp.btb_paid, 0) as btb_paid,
       coalesce(od.other, 0) as other_distributed,
       r.realized_amount - coalesce(bp.btb_paid, 0) - coalesce(od.other, 0) as undistributed,
       round(r.realized_amount * r.erq_pct / 100, 2) as erq_amount,
       app.convert(r.realized_amount, b.currency, 'USD', r.realization_date) as realized_usd
  from public.realizations r
  join public.v_export_bills b on b.id = r.export_bill_id
  left join lateral (select sum(amount) total from public.realization_deductions
                      where realization_id = r.id and status <> 'void') d on true
  left join lateral (select sum(amount) other from public.realization_distributions
                      where realization_id = r.id and status <> 'void') od on true
  left join lateral (
    select sum(app.convert(p.amount, l.currency, b.currency, p.payment_date)) btb_paid
      from public.import_payments p
      join public.acceptances a on a.id = p.acceptance_id
      join public.import_lcs l on l.id = a.import_lc_id
     where p.realization_id = r.id and p.status <> 'void') bp on true;

-- ---------------------------------------------------------------------
-- Bank facility limit vs utilization (Phase 4)
--  BTB  = open liability of BTB LCs (sight/deferred) at the bank
--  UPAS = open liability of UPAS LCs
--  EDF  = open EDF loans  (+ open liability of LCs opened as EDF)
--  PC   = open PC loans
--  FDBP = purchased/negotiated export bills not yet realized
-- ---------------------------------------------------------------------
create view public.v_loans with (security_invoker = true) as
select bl.*, bk.name as bank_name, c.contract_no,
       coalesce(rp.repaid, 0) as repaid,
       bl.amount - coalesce(rp.repaid, 0) as outstanding
  from public.bank_loans bl
  join public.banks bk on bk.id = bl.bank_id
  left join public.export_contracts c on c.id = bl.contract_id
  left join lateral (select sum(amount) repaid from public.loan_repayments
                      where loan_id = bl.id and status <> 'void') rp on true;

create view public.v_bank_utilization with (security_invoker = true) as
with used as (
  select bank_id, 'BTB'::public.facility_type ft, currency, open_liability amt
    from public.v_import_lcs where is_btb and payment_type in ('sight', 'deferred', 'cash') and status <> 'void'
  union all
  select bank_id, 'UPAS', currency, open_liability from public.v_import_lcs
   where payment_type = 'upas' and status <> 'void'
  union all
  select bank_id, 'EDF', currency, open_liability from public.v_import_lcs
   where payment_type = 'edf' and status <> 'void'
  union all
  select bank_id, loan_type, currency, outstanding from public.v_loans where status <> 'void'
  union all
  select bank_id, 'FDBP', currency,
         least(coalesce(purchase_amount, bill_value), greatest(bill_value - realized_amount, 0))
    from public.v_export_bills
   where bill_type in ('FDBP', 'LDBP') and status <> 'void' and not is_closed
)
select f.id, f.bank_id, bk.name as bank_name, f.facility_type, f.is_funded,
       f.limit_amount, f.currency, f.valid_from, f.valid_to, f.sanction_ref,
       coalesce(u.utilized, 0) as utilized,
       f.limit_amount - coalesce(u.utilized, 0) as available,
       case when f.limit_amount > 0 then round(coalesce(u.utilized, 0) * 100 / f.limit_amount, 1) end as utilization_pct,
       app.convert(f.limit_amount, f.currency, 'USD') as limit_usd,
       app.convert(coalesce(u.utilized, 0), f.currency, 'USD') as utilized_usd
  from public.bank_facilities f
  join public.banks bk on bk.id = f.bank_id
  left join lateral (
    select sum(app.convert(used.amt, used.currency, f.currency)) utilized
      from used where used.bank_id = f.bank_id and used.ft = f.facility_type) u on true
 where f.status = 'active';

-- ---------------------------------------------------------------------
-- Customs bond & incentive views (Phase 3)
-- ---------------------------------------------------------------------
create view public.v_incentive_claims with (security_invoker = true) as
select ic.*,
       r.realization_date, r.realized_amount, r.exchange_rate, r.prc_no, r.prc_date,
       b.bill_ref_no, b.contract_id, b.contract_no, b.buyer_name, b.currency, b.invoice_nos, b.exp_nos, b.bl_date,
       case when ic.claim_status = 'submitted' and ic.submission_date is not null
            then app.today() - ic.submission_date end as days_pending
  from public.incentive_claims ic
  join public.realizations r on r.id = ic.realization_id
  join public.v_export_bills b on b.id = r.export_bill_id;

-- Realized shipments with an applicable scheme and no claim yet
create view public.v_incentive_eligible with (security_invoker = true) as
select r.id as realization_id, r.realization_date, r.realized_amount, r.exchange_rate,
       b.bill_ref_no, b.contract_no, b.buyer_name, b.currency, b.invoice_nos, b.exp_nos, b.bl_date,
       sch.scheme
  from public.realizations r
  join public.v_export_bills b on b.id = r.export_bill_id
  join public.export_contracts c on c.id = b.contract_id
  join public.buyers by_ on by_.id = c.buyer_id
  cross join lateral (
    select distinct ir.scheme from public.incentive_rates ir where ir.status = 'active'
       and (app.incentive_rate(ir.scheme, c.product_category, coalesce(by_.market, c.destination_country),
                               coalesce(b.bl_date, r.realization_date))).id is not null) sch
 where r.status <> 'void' and b.status <> 'void'
   and not exists (select 1 from public.incentive_claims ic
                    where ic.realization_id = r.id and ic.scheme = sch.scheme and ic.status <> 'void');

-- ---------------------------------------------------------------------
-- Document store (Phase 4): every attachment with a readable reference
-- ---------------------------------------------------------------------
create or replace function app.entity_label(p_table text, p_id uuid)
returns text language sql stable as $$
  select case p_table
    when 'export_contracts' then (select contract_no || ' (' || contract_type || ')' from public.export_contracts where id = p_id)
    when 'import_lcs'       then (select coalesce(lc_no, 'Draft ' || application_no, 'Draft LC') from public.import_lcs where id = p_id)
    when 'acceptances'      then (select 'Acceptance ' || supplier_invoice_no from public.acceptances where id = p_id)
    when 'import_payments'  then (select 'Payment ' || coalesce(reference, payment_date::text) from public.import_payments where id = p_id)
    when 'proforma_invoices' then (select 'PI ' || pi_no from public.proforma_invoices where id = p_id)
    when 'import_shipments' then (select 'Shipment ' || coalesce(bl_awb_no, bill_of_entry_no, '') from public.import_shipments where id = p_id)
    when 'goods_receipts'   then (select 'GRN ' || grn_no from public.goods_receipts where id = p_id)
    when 'export_invoices'  then (select 'Invoice ' || invoice_no from public.export_invoices where id = p_id)
    when 'export_bills'     then (select 'Bill ' || coalesce(bill_ref_no, submission_date::text) from public.export_bills where id = p_id)
    when 'realizations'     then (select 'Realization ' || coalesce(prc_no, realization_date::text) from public.realizations where id = p_id)
    when 'incentive_claims' then (select 'Incentive ' || coalesce(claim_no, scheme) from public.incentive_claims where id = p_id)
    when 'bond_licenses'    then (select 'Bond ' || license_no from public.bond_licenses where id = p_id)
    when 'buyers'           then (select name from public.buyers where id = p_id)
    when 'suppliers'        then (select name from public.suppliers where id = p_id)
    when 'banks'            then (select name from public.banks where id = p_id)
    else p_table end;
$$;

create view public.v_documents with (security_invoker = true) as
select a.*, app.entity_label(a.entity_table, a.entity_id) as entity_label,
       p.full_name as uploaded_by_name
  from public.attachments a
  left join public.profiles p on p.id = a.created_by;

-- ---------------------------------------------------------------------
-- Alerts (in-app list + daily email). Thresholds in app_settings 'alerts'.
-- ---------------------------------------------------------------------
create or replace function app.alert_days(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> p_key)::int from public.app_settings where key = 'alerts'), p_default);
$$;

create view public.v_alerts with (security_invoker = true) as
select * from (
  select 'export_lc_expiry'::text as alert_type, 'export_contracts'::text as ref_table, id as ref_id,
         contract_no as ref_no, 'Master LC/SC expiry - ' || buyer_name as title,
         current_expiry as due_date, current_value as amount, currency
    from public.v_export_contracts
   where status = 'active' and days_to_expiry between -7 and app.alert_days('lc_expiry_days', 30)
  union all
  select 'export_lsd', 'export_contracts', id, contract_no, 'Last shipment date - ' || buyer_name,
         current_lsd, balance_to_ship, currency
    from public.v_export_contracts
   where status = 'active' and balance_to_ship > 0 and days_to_lsd between -7 and app.alert_days('lsd_days', 30)
  union all
  select 'import_lc_expiry', 'import_lcs', id, lc_no, 'Import LC expiry - ' || supplier_name,
         current_expiry, current_value - accepted_value, currency
    from public.v_import_lcs
   where status = 'opened' and current_value > accepted_value
     and days_to_expiry between -7 and app.alert_days('lc_expiry_days', 30)
  union all
  select 'acceptance_maturity', 'acceptances', id, lc_no, 'Maturity due - ' || supplier_name || ' / ' || supplier_invoice_no,
         maturity_date, outstanding, currency
    from public.v_acceptances
   where status <> 'void' and outstanding > 0 and maturity_date is not null
     and days_to_maturity <= app.alert_days('maturity_days', 15)
  union all
  select 'btb_approval', 'import_lcs', id, coalesce(lc_no, application_no), 'BTB above entitlement - GM approval needed',
         application_date, value, currency
    from public.import_lcs where approval_status = 'pending' and status <> 'void'
  union all
  select 'bill_overdue', 'export_bills', id, coalesce(bill_ref_no, invoice_nos), 'Export bill not realized - ' || buyer_name,
         due_date, outstanding, currency
    from public.v_export_bills where bill_status = 'overdue'
  union all
  select 'demurrage_risk', 'import_shipments', id, coalesce(bl_awb_no, lc_no), 'Demurrage risk at ' || port || ' - ' || supplier_name,
         arrival_date + free_days, null, null
    from public.v_import_shipments where demurrage_risk in ('high', 'medium')
  union all
  select 'bond_expiry', 'bond_licenses', id, license_no, 'Bond license expiry',
         valid_to, null, null
    from public.bond_licenses where status = 'active'
     and valid_to - app.today() <= app.alert_days('bond_days', 60)
  union all
  select 'incentive_pending', 'incentive_claims', id, coalesce(claim_no, bill_ref_no), 'Incentive claim pending - ' || scheme,
         submission_date, claim_amount_bdt, 'BDT'
    from public.v_incentive_claims
   where status <> 'void' and claim_status in ('submitted', 'under_audit')
     and days_pending >= app.alert_days('incentive_pending_days', 90)
) x
cross join lateral (select x.due_date - app.today() as days_left,
                           case when x.due_date < app.today() or x.alert_type in ('btb_approval', 'bill_overdue') then 'high'
                                when x.due_date - app.today() <= 7 then 'medium' else 'low' end as severity) s;

-- ---------------------------------------------------------------------
-- Small helper views for child grids
-- ---------------------------------------------------------------------
create view public.v_proforma_invoices with (security_invoker = true) as
select p.*, s.name as supplier_name, c.contract_no, l.lc_no,
       coalesce((select sum(amount) from public.pi_items x where x.pi_id = p.id and x.status <> 'void'), 0) as pi_value
  from public.proforma_invoices p
  join public.suppliers s on s.id = p.supplier_id
  left join public.export_contracts c on c.id = p.contract_id
  left join public.import_lcs l on l.id = p.import_lc_id;

create view public.v_pi_items with (security_invoker = true) as
select x.*, i.name as item_name, i.code as item_code
  from public.pi_items x join public.items i on i.id = x.item_id;

create view public.v_grn_items with (security_invoker = true) as
select x.*, i.name as item_name, i.code as item_code
  from public.grn_items x join public.items i on i.id = x.item_id;

create view public.v_ud_items with (security_invoker = true) as
select x.*, i.name as item_name, i.unit_code
  from public.ud_items x join public.items i on i.id = x.item_id;

create view public.v_bond_opening_balances with (security_invoker = true) as
select x.*, i.name as item_name, i.unit_code
  from public.bond_opening_balances x join public.items i on i.id = x.item_id;
