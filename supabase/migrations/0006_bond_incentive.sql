-- =====================================================================
-- 0006 (PHASE 3) CUSTOMS BOND STATEMENT & CASH INCENTIVE
-- =====================================================================

create table public.bond_licenses (
  id               uuid primary key default gen_random_uuid(),
  license_no       text not null unique,
  commissionerate  text not null default 'Customs Bond Commissionerate, Dhaka',
  issue_date       date,
  valid_from       date not null,
  valid_to         date not null,
  remarks          text,
  check (valid_to >= valid_from)
);
select app.setup_table('bond_licenses', array['active','void']);

-- Physical / audited balance per material at a date (start of the bond period)
create table public.bond_opening_balances (
  id               uuid primary key default gen_random_uuid(),
  bond_license_id  uuid not null references public.bond_licenses (id),
  item_id          uuid not null references public.items (id),
  as_of_date       date not null,
  quantity         numeric(16,3) not null,
  remarks          text,
  unique (bond_license_id, item_id, as_of_date)
);
select app.setup_table('bond_opening_balances', array['active','void']);

-- Date an export counts for the bond: Bill of Export date, else BL date, else invoice date
create or replace function app.export_bond_date(i public.export_invoices)
returns date language sql immutable as $$
  select coalesce(i.shipping_bill_date, i.exp_date, i.bl_date, i.invoice_date);
$$;

-- Import entries under bond (Bill of Entry wise), from goods receipts
create or replace function public.bond_import_entries(p_from date, p_to date)
returns table (bill_of_entry_no text, bill_of_entry_date date, import_lc_no text, supplier text,
               item_id uuid, item_name text, unit_code text, quantity numeric, grn_no text, grn_date date)
language sql stable as $$
  select s.bill_of_entry_no, s.bill_of_entry_date, l.lc_no, sp.name,
         it.id, it.name, gi.unit_code, gi.quantity, g.grn_no, g.grn_date
    from public.grn_items gi
    join public.goods_receipts g on g.id = gi.grn_id and g.status <> 'void'
    join public.import_lcs l on l.id = g.import_lc_id
    join public.suppliers sp on sp.id = l.supplier_id
    join public.items it on it.id = gi.item_id and it.is_bonded
    left join public.import_shipments s on s.id = g.import_shipment_id
   where gi.status <> 'void'
     and coalesce(s.bill_of_entry_date, g.grn_date) between p_from and p_to
   order by coalesce(s.bill_of_entry_date, g.grn_date), s.bill_of_entry_no, it.name;
$$;

-- Export entries (Bill of Export wise) with material consumption from UD coefficients.
-- The latest active UD of the invoice's Master LC is used.
create or replace function public.bond_export_entries(p_from date, p_to date)
returns table (shipping_bill_no text, shipping_bill_date date, exp_no text, invoice_no text,
               contract_no text, ud_no text, garment_qty_pcs numeric,
               item_id uuid, item_name text, unit_code text,
               coefficient_per_dozen numeric, consumption numeric)
language sql stable as $$
  with inv as (
    select i.*, app.export_bond_date(i) as bond_date,
           (select sum(quantity_pcs) from public.export_invoice_items x
             where x.invoice_id = i.id and x.status <> 'void') as qty
      from public.export_invoices i
     where i.status <> 'void' and app.export_bond_date(i) between p_from and p_to
  ), ud as (
    select distinct on (contract_id) id, contract_id, ud_no
      from public.uds where status <> 'void'
     order by contract_id, ud_date desc
  )
  select inv.shipping_bill_no, inv.bond_date, inv.exp_no, inv.invoice_no,
         c.contract_no, ud.ud_no, inv.qty,
         it.id, it.name, it.unit_code, ui.coefficient_per_dozen,
         round(inv.qty / 12 * ui.coefficient_per_dozen, 3)
    from inv
    join public.export_contracts c on c.id = inv.contract_id
    left join ud on ud.contract_id = inv.contract_id
    left join public.ud_items ui on ui.ud_id = ud.id and ui.status <> 'void'
    left join public.items it on it.id = ui.item_id
   order by inv.bond_date, inv.shipping_bill_no, inv.invoice_no, it.name;
$$;

-- Opening + imports - consumption = closing, per bonded material
create or replace function public.bond_statement(p_license uuid, p_from date, p_to date)
returns table (item_id uuid, item_code text, item_name text, unit_code text,
               opening numeric, imports numeric, consumption numeric, closing numeric)
language sql stable as $$
  with ob as (
    select distinct on (item_id) item_id, as_of_date, quantity
      from public.bond_opening_balances
     where bond_license_id = p_license and status <> 'void' and as_of_date <= p_from
     order by item_id, as_of_date desc
  ), base as (
    select it.id, it.code, it.name, it.unit_code,
           coalesce(ob.quantity, 0) as ob_qty,
           coalesce(ob.as_of_date, date '1900-01-01') as ob_date
      from public.items it left join ob on ob.item_id = it.id
     where it.is_bonded and it.status <> 'void'
  ), imp as (
    select e.item_id, e.bill_of_entry_date, e.grn_date, e.quantity from public.bond_import_entries(date '1900-01-01', p_to) e
  ), con as (
    select e.item_id, e.shipping_bill_date, e.consumption from public.bond_export_entries(date '1900-01-01', p_to) e
     where e.item_id is not null
  )
  select b.id, b.code, b.name, b.unit_code,
         o.opening, i.imports, c.consumption,
         o.opening + i.imports - c.consumption
    from base b
    cross join lateral (
      select b.ob_qty
           + coalesce((select sum(quantity) from imp where imp.item_id = b.id
                        and coalesce(imp.bill_of_entry_date, imp.grn_date) >= b.ob_date
                        and coalesce(imp.bill_of_entry_date, imp.grn_date) < p_from), 0)
           - coalesce((select sum(consumption) from con where con.item_id = b.id
                        and con.shipping_bill_date >= b.ob_date and con.shipping_bill_date < p_from), 0)
             as opening) o
    cross join lateral (
      select coalesce(sum(quantity), 0) as imports from imp where imp.item_id = b.id
         and coalesce(imp.bill_of_entry_date, imp.grn_date) between greatest(p_from, b.ob_date) and p_to) i
    cross join lateral (
      select coalesce(sum(consumption), 0) as consumption from con where con.item_id = b.id
         and con.shipping_bill_date between greatest(p_from, b.ob_date) and p_to) c
   where o.opening <> 0 or i.imports <> 0 or c.consumption <> 0
   order by b.name;
$$;

-- ---------------------------------------------------------------------
-- Cash incentive
-- ---------------------------------------------------------------------
create table public.incentive_rates (
  id                uuid primary key default gen_random_uuid(),
  scheme            text not null,     -- e.g. Alternative Cash Assistance, New Market, Special RMG
  product_category  text not null default 'all',   -- knit / woven / all
  market            text not null default 'all',   -- EU / USA / UK / Canada / New Market / all
  rate_pct          numeric(6,3) not null check (rate_pct >= 0),
  effective_from    date not null,
  effective_to      date,
  circular_ref      text,
  remarks           text,
  check (effective_to is null or effective_to >= effective_from)
);
select app.setup_table('incentive_rates', array['active','void']);

-- Best matching rate on a date (specific product/market beats "all")
create or replace function app.incentive_rate(p_scheme text, p_category text, p_market text, p_date date)
returns public.incentive_rates language sql stable as $$
  select r.* from public.incentive_rates r
   where r.status = 'active' and r.scheme = p_scheme
     and r.product_category in (coalesce(p_category, 'all'), 'all')
     and r.market in (coalesce(p_market, 'all'), 'all')
     and p_date >= r.effective_from and (r.effective_to is null or p_date <= r.effective_to)
   order by (r.product_category <> 'all')::int + (r.market <> 'all')::int desc, r.effective_from desc
   limit 1;
$$;

create table public.incentive_claims (
  id                    uuid primary key default gen_random_uuid(),
  realization_id        uuid not null references public.realizations (id),
  scheme                text not null,
  claim_no              text,
  base_amount           numeric(18,2),     -- net FOB eligible (bill currency); defaults from realization
  rate_id               uuid references public.incentive_rates (id),   -- set by trigger
  rate_pct              numeric(6,3),      -- snapshot, set by trigger
  claim_amount          numeric(18,2),     -- set by trigger (bill currency)
  claim_amount_bdt      numeric(20,2),     -- set by trigger (realization rate)
  -- document checklist
  doc_application       boolean not null default false,   -- Form-Ka / application
  doc_invoice           boolean not null default false,
  doc_packing_list      boolean not null default false,
  doc_exp               boolean not null default false,
  doc_bl                boolean not null default false,
  doc_prc               boolean not null default false,
  doc_ud                boolean not null default false,
  doc_input_certificate boolean not null default false,   -- local input supplier certificate
  doc_auditor_cert      boolean not null default false,
  submission_date       date,      -- to lien bank
  auditor_cert_date     date,
  claim_status          text not null default 'not_claimed'
                         check (claim_status in ('not_claimed', 'submitted', 'under_audit', 'received', 'rejected')),
  received_amount_bdt   numeric(20,2),
  received_date         date,
  rejection_reason      text,
  remarks               text
);
select app.setup_table('incentive_claims', array['active','void']);
create unique index incentive_claims_uq on public.incentive_claims (realization_id, scheme) where status <> 'void';

create or replace function app.tg_incentive_claim_rules()
returns trigger language plpgsql as $$
declare
  r   public.realizations;
  c   public.export_contracts;
  b   public.buyers;
  rt  public.incentive_rates;
  v_ship date;
  v_ded  numeric;
begin
  select * into r from public.realizations where id = new.realization_id;
  select c2.* into c from public.export_contracts c2
    join public.export_bills eb on eb.contract_id = c2.id where eb.id = r.export_bill_id;
  select * into b from public.buyers where id = c.buyer_id;
  select max(bl_date) into v_ship from public.export_invoices
   where export_bill_id = r.export_bill_id and status <> 'void';
  v_ship := coalesce(v_ship, r.realization_date);

  if new.base_amount is null then
    select coalesce(sum(amount), 0) into v_ded from public.realization_deductions
     where realization_id = r.id and status <> 'void' and reason in ('commission', 'freight');
    new.base_amount := r.realized_amount - v_ded;
  end if;

  if tg_op = 'INSERT' or new.scheme is distinct from old.scheme
     or new.base_amount is distinct from old.base_amount or new.rate_id is null then
    rt := app.incentive_rate(new.scheme, c.product_category, coalesce(b.market, c.destination_country), v_ship);
    if rt.id is null then
      raise exception 'No % rate for % / % effective on %. Add it in Incentive Rates.',
        new.scheme, c.product_category, coalesce(b.market, c.destination_country, 'all'), v_ship;
    end if;
    new.rate_id := rt.id;
    new.rate_pct := rt.rate_pct;
  end if;
  new.claim_amount := round(new.base_amount * new.rate_pct / 100, 2);
  new.claim_amount_bdt := round(new.claim_amount * r.exchange_rate, 2);
  if new.claim_status = 'received' and new.received_amount_bdt is null then
    raise exception 'Enter the amount received';
  end if;
  return new;
end $$;

create trigger incentive_claims_rules before insert or update on public.incentive_claims
  for each row execute function app.tg_incentive_claim_rules();
