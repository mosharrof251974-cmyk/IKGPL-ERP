-- =====================================================================
-- 0005 (PHASE 2) IMPORT SHIPMENT & PORT CLEARING, GOODS RECEIPT,
--      EXPORT DOCUMENTATION, DRAFT BL CHECK, BANK SUBMISSION,
--      PROCEEDS REALIZATION
-- =====================================================================

-- ---------------------------------------------------------------------
-- Import shipments & port clearing
-- ---------------------------------------------------------------------
create table public.import_shipments (
  id                   uuid primary key default gen_random_uuid(),
  import_lc_id         uuid not null references public.import_lcs (id),
  acceptance_id        uuid references public.acceptances (id),
  mode                 text not null default 'sea' check (mode in ('sea', 'air', 'road', 'local')),
  vessel_flight        text,
  bl_awb_no            text,
  bl_awb_date          date,
  container_nos        text,
  packages             text,
  gross_weight_kg      numeric(14,3),
  etd                  date,
  eta                  date,
  arrival_date         date,
  port                 text not null,     -- Chattogram, Dhaka ICD, Benapole, HSIA Dhaka, Mongla, Pangaon
  free_days            int not null default 4 check (free_days >= 0),  -- before demurrage
  cf_agent_id          uuid references public.cf_agents (id),
  bill_of_entry_no     text,
  bill_of_entry_date   date,
  assessable_value_bdt numeric(18,2),
  duty_paid_bdt        numeric(18,2) not null default 0,
  release_date         date,
  -- shipping documents checklist
  doc_invoice          boolean not null default false,
  doc_packing_list     boolean not null default false,
  doc_bl_awb           boolean not null default false,
  doc_coo              boolean not null default false,
  doc_insurance        boolean not null default false,
  doc_test_cert        boolean not null default false,
  remarks              text,
  check (release_date is null or arrival_date is null or release_date >= arrival_date)
);
select app.setup_table('import_shipments', array['active','void']);
create index import_shipments_lc_idx on public.import_shipments (import_lc_id);
create unique index import_shipments_boe_uq on public.import_shipments (bill_of_entry_no, bill_of_entry_date)
  where bill_of_entry_no is not null and status <> 'void';

-- ---------------------------------------------------------------------
-- Goods receipt (store)
-- ---------------------------------------------------------------------
create table public.goods_receipts (
  id                  uuid primary key default gen_random_uuid(),
  grn_no              text not null unique,
  grn_date            date not null,
  import_lc_id        uuid not null references public.import_lcs (id),
  import_shipment_id  uuid references public.import_shipments (id),
  store_location      text,
  challan_no          text,
  remarks             text
);
select app.setup_table('goods_receipts', array['active','void']);

create table public.grn_items (
  id              uuid primary key default gen_random_uuid(),
  grn_id          uuid not null references public.goods_receipts (id),
  item_id         uuid not null references public.items (id),
  quantity        numeric(16,3) not null check (quantity > 0),
  unit_code       text not null references public.units (code),
  remarks         text
);
select app.setup_table('grn_items', array['active','void']);

-- ---------------------------------------------------------------------
-- Export documentation
-- ---------------------------------------------------------------------
create table public.export_bills (
  id                     uuid primary key default gen_random_uuid(),
  contract_id            uuid not null references public.export_contracts (id),
  bank_id                uuid not null references public.banks (id),
  submission_date        date not null,
  bill_type              text not null default 'FDBC' check (bill_type in ('FDBC', 'FDBP', 'LDBC', 'LDBP')),
  bill_ref_no            text unique,          -- FDBC / FDBP number given by bank
  buyer_acceptance_date  date,                 -- for "x days from receipt/acceptance" terms
  courier_name           text,
  courier_awb_no         text,
  courier_date           date,
  negotiation_date       date,
  purchase_amount        numeric(18,2),
  purchase_rate          numeric(14,4),
  remarks                text
);
select app.setup_table('export_bills', array['active','void']);

create table public.export_invoices (
  id                    uuid primary key default gen_random_uuid(),
  contract_id           uuid not null references public.export_contracts (id),
  invoice_no            text not null unique,
  invoice_date          date not null,
  buyer_order_no        text,
  exp_no                text,
  exp_date              date,
  shipping_bill_no      text,       -- Bill of Export
  shipping_bill_date    date,
  port_of_loading       text,
  port_of_discharge     text,
  final_destination     text,
  mode                  text not null default 'sea' check (mode in ('sea', 'air', 'road')),
  vessel_voyage         text,
  container_no          text,
  shipping_marks        text,
  port_submission_date  date,
  -- goods handover to forwarder
  forwarder_id          uuid references public.freight_forwarders (id),
  handover_date         date,
  handover_cartons      int,
  handover_cbm          numeric(12,3),
  fcr_no                text,
  -- BL
  draft_bl_received_date date,
  bl_no                 text,
  bl_date               date,        -- shipped on board date
  bl_collection_date    date,
  export_bill_id        uuid references public.export_bills (id),
  remarks               text
);
select app.setup_table('export_invoices', array['active','void']);
create index export_invoices_contract_idx on public.export_invoices (contract_id);

-- Invoice + packing list lines
create table public.export_invoice_items (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.export_invoices (id),
  style_no        text,
  description     text not null,
  hs_code         text,
  color           text,
  quantity_pcs    numeric(14,0) not null check (quantity_pcs > 0),
  unit_price      numeric(14,4) not null check (unit_price >= 0),
  amount          numeric(18,2) generated always as (round(quantity_pcs * unit_price, 2)) stored,
  cartons         int not null default 0,
  carton_from     int,
  carton_to       int,
  net_weight_kg   numeric(14,3) not null default 0,
  gross_weight_kg numeric(14,3) not null default 0,
  cbm             numeric(12,3) not null default 0
);
select app.setup_table('export_invoice_items', array['active','void']);

-- Draft BL / FCR check: expected vs draft value per field
create table public.bl_checks (
  id                uuid primary key default gen_random_uuid(),
  export_invoice_id uuid not null references public.export_invoices (id),
  check_date        date not null,
  draft_ref         text,
  -- [{field, label, expected, draft, auto_match, result: pass|discrepancy, note}]
  results           jsonb not null default '[]',
  overall_result    text not null default 'pending' check (overall_result in ('pending', 'pass', 'discrepancy')),
  remarks           text
);
select app.setup_table('bl_checks', array['active','void']);

-- Invoices on a bill must belong to the bill's contract
create or replace function app.tg_export_invoice_rules()
returns trigger language plpgsql as $$
begin
  if new.export_bill_id is not null and
     (select contract_id from public.export_bills where id = new.export_bill_id) <> new.contract_id then
    raise exception 'Invoice % belongs to a different Master LC than the bank bill', new.invoice_no;
  end if;
  return new;
end $$;
create trigger export_invoices_rules before insert or update on public.export_invoices
  for each row execute function app.tg_export_invoice_rules();

-- ---------------------------------------------------------------------
-- Proceeds realization
-- ---------------------------------------------------------------------
create table public.realizations (
  id                uuid primary key default gen_random_uuid(),
  export_bill_id    uuid not null references public.export_bills (id),
  realization_date  date not null,
  realized_amount   numeric(18,2) not null check (realized_amount >= 0),  -- bill currency
  exchange_rate     numeric(14,4) not null check (exchange_rate > 0),
  amount_bdt        numeric(20,2) generated always as (round(realized_amount * exchange_rate, 2)) stored,
  erq_pct           numeric(5,2) not null default 0,
  is_final          boolean not null default true,   -- bill closed (any shortfall is short realization)
  prc_no            text,
  prc_date          date,
  remarks           text
);
select app.setup_table('realizations', array['active','void']);

create table public.realization_deductions (
  id              uuid primary key default gen_random_uuid(),
  realization_id  uuid not null references public.realizations (id),
  reason          text not null check (reason in ('foreign_bank_charges', 'local_bank_charges',
                    'discount_claim', 'short_shipment', 'commission', 'freight', 'other')),
  amount          numeric(18,2) not null check (amount > 0),
  remarks         text
);
select app.setup_table('realization_deductions', array['active','void']);

-- Distribution of proceeds other than BTB payments.
-- BTB payments are rows in import_payments with realization_id set.
create table public.realization_distributions (
  id              uuid primary key default gen_random_uuid(),
  realization_id  uuid not null references public.realizations (id),
  head            text not null check (head in ('pc_adjustment', 'erq', 'fc_account', 'cd_account',
                    'edf_repayment', 'bank_charges', 'other')),
  amount          numeric(18,2) not null check (amount > 0),   -- bill currency
  remarks         text
);
select app.setup_table('realization_distributions', array['active','void']);

alter table public.import_payments
  add constraint import_payments_realization_fk
  foreign key (realization_id) references public.realizations (id);

-- Amount of a realization already distributed (bill currency)
create or replace function app.realization_distributed(p_realization uuid, p_skip_payment uuid default null,
                                                       p_skip_distribution uuid default null)
returns numeric language sql stable as $$
  select coalesce((select sum(d.amount) from public.realization_distributions d
                    where d.realization_id = p_realization and d.status <> 'void'
                      and d.id is distinct from p_skip_distribution), 0)
       + coalesce((select sum(app.convert(p.amount, l.currency, c.currency, p.payment_date))
                     from public.import_payments p
                     join public.acceptances a on a.id = p.acceptance_id
                     join public.import_lcs l on l.id = a.import_lc_id
                     join public.realizations r on r.id = p.realization_id
                     join public.export_bills b on b.id = r.export_bill_id
                     join public.export_contracts c on c.id = b.contract_id
                    where p.realization_id = p_realization and p.status <> 'void'
                      and p.id is distinct from p_skip_payment), 0);
$$;

-- Payment rules: not more than the acceptance; proceeds-funded payments must be
-- under the same Master LC as the realization, and within the realized amount.
create or replace function app.tg_import_payment_rules()
returns trigger language plpgsql as $$
declare
  a public.acceptances;
  l public.import_lcs;
  r public.realizations;
  b public.export_bills;
  v_paid numeric;
  v_in_bill_ccy numeric;
begin
  if new.status = 'void' then return new; end if;
  select * into a from public.acceptances where id = new.acceptance_id;
  select * into l from public.import_lcs where id = a.import_lc_id;
  if a.status = 'void' then raise exception 'Acceptance is void'; end if;

  select coalesce(sum(amount), 0) + new.amount into v_paid
    from public.import_payments where acceptance_id = a.id and status <> 'void' and id <> new.id;
  if v_paid > a.document_value + 0.005 then
    raise exception 'Payments % % would exceed the accepted value % %',
      l.currency, to_char(v_paid, 'FM999,999,999,990.00'), l.currency, to_char(a.document_value, 'FM999,999,999,990.00');
  end if;

  if new.source = 'export_proceeds' and new.realization_id is null then
    raise exception 'Select the export realization that funds this payment';
  end if;
  if new.realization_id is not null then
    new.source := 'export_proceeds';
    select * into r from public.realizations where id = new.realization_id;
    select * into b from public.export_bills where id = r.export_bill_id;
    if r.status = 'void' then raise exception 'Realization is void'; end if;
    if l.contract_id is distinct from b.contract_id then
      raise exception 'Proceeds can only pay BTB LCs opened under the same Master LC';
    end if;
    v_in_bill_ccy := app.convert(new.amount, l.currency,
                       (select currency from public.export_contracts where id = b.contract_id), new.payment_date);
    if app.realization_distributed(r.id, new.id) + v_in_bill_ccy > r.realized_amount + 0.005 then
      raise exception 'Distribution exceeds the realized amount';
    end if;
  end if;
  return new;
end $$;

create trigger import_payments_rules before insert or update on public.import_payments
  for each row execute function app.tg_import_payment_rules();

create or replace function app.tg_distribution_rules()
returns trigger language plpgsql as $$
declare r public.realizations;
begin
  if new.status = 'void' then return new; end if;
  select * into r from public.realizations where id = new.realization_id;
  if app.realization_distributed(r.id, null, new.id) + new.amount > r.realized_amount + 0.005 then
    raise exception 'Distribution exceeds the realized amount';
  end if;
  return new;
end $$;

create trigger realization_distributions_rules before insert or update on public.realization_distributions
  for each row execute function app.tg_distribution_rules();
