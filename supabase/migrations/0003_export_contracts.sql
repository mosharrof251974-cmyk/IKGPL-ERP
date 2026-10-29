-- =====================================================================
-- 0003 EXPORT CONTRACTS (Master LC / Sales Contract), amendments, UD/UP
-- =====================================================================

create table public.export_contracts (
  id                  uuid primary key default gen_random_uuid(),
  contract_no         text not null unique,
  contract_type       text not null check (contract_type in ('LC', 'SC')),
  buyer_id            uuid not null references public.buyers (id),
  issuing_bank_id     uuid references public.banks (id),
  lien_bank_id        uuid not null references public.banks (id),
  currency            text not null references public.currencies (code),
  value               numeric(18,2) not null check (value > 0),    -- original value
  tolerance_pct       numeric(5,2) not null default 5 check (tolerance_pct between 0 and 20),
  quantity_pcs        numeric(14,0),
  issue_date          date not null,
  last_shipment_date  date not null,
  expiry_date         date not null,
  lien_date           date,
  lien_ref            text,
  payment_terms       text,
  -- export bill due date = basis date + tenor days
  tenor_days          int not null default 0 check (tenor_days >= 0),
  tenor_basis         text not null default 'bl_date'
                       check (tenor_basis in ('bl_date', 'submission_date', 'buyer_acceptance_date')),
  incoterm            text,
  port_of_loading     text,
  port_of_discharge   text,
  destination_country text,
  product_category    text not null default 'knit',  -- for incentive rate lookup
  btb_entitlement_pct numeric(5,2) not null default 75 check (btb_entitlement_pct between 0 and 100),
  consignee_text      text,      -- e.g. TO THE ORDER OF AL-ARAFAH ISLAMI BANK LTD ...
  notify_text         text,
  remarks             text,
  check (expiry_date >= last_shipment_date),
  check (last_shipment_date >= issue_date)
);
select app.setup_table('export_contracts', array['active','draft','closed','void']);

create table public.export_contract_amendments (
  id                      uuid primary key default gen_random_uuid(),
  contract_id             uuid not null references public.export_contracts (id),
  amendment_no            int not null check (amendment_no > 0),
  amendment_date          date not null,
  value_change            numeric(18,2) not null default 0,
  quantity_change         numeric(14,0) not null default 0,
  new_last_shipment_date  date,
  new_expiry_date         date,
  new_tolerance_pct       numeric(5,2),
  description             text,
  unique (contract_id, amendment_no)
);
select app.setup_table('export_contract_amendments', array['active','void']);

-- Utilization Declaration / Permission (BGMEA / BKMEA)
create table public.uds (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.export_contracts (id),
  ud_type       text not null default 'UD' check (ud_type in ('UD', 'UP')),
  association   text not null default 'BGMEA' check (association in ('BGMEA', 'BKMEA')),
  ud_no         text not null,
  ud_date       date not null,
  garment_qty_pcs numeric(14,0),
  remarks       text,
  unique (association, ud_no)
);
select app.setup_table('uds', array['active','void']);

create table public.ud_amendments (
  id             uuid primary key default gen_random_uuid(),
  ud_id          uuid not null references public.uds (id),
  amendment_no   int not null check (amendment_no > 0),
  amendment_date date not null,
  description    text,
  unique (ud_id, amendment_no)
);
select app.setup_table('ud_amendments', array['active','void']);

-- Material consumption coefficients declared in the UD (used by bond statement).
-- coefficient = material quantity per DOZEN garments, wastage included.
create table public.ud_items (
  id                    uuid primary key default gen_random_uuid(),
  ud_id                 uuid not null references public.uds (id),
  item_id               uuid not null references public.items (id),
  coefficient_per_dozen numeric(14,6) not null check (coefficient_per_dozen >= 0),
  wastage_pct           numeric(5,2) not null default 0,
  entitled_qty          numeric(16,3),
  remarks               text,
  unique (ud_id, item_id)
);
select app.setup_table('ud_items', array['active','void']);

-- Current (amended) terms of a contract
create or replace function app.contract_current(p_contract uuid,
  out current_value numeric, out current_qty numeric, out current_lsd date,
  out current_expiry date, out current_tolerance numeric)
language sql stable as $$
  select c.value + coalesce((select sum(value_change) from public.export_contract_amendments a
                              where a.contract_id = c.id and a.status = 'active'), 0),
         c.quantity_pcs + coalesce((select sum(quantity_change) from public.export_contract_amendments a
                              where a.contract_id = c.id and a.status = 'active'), 0),
         coalesce((select new_last_shipment_date from public.export_contract_amendments a
                    where a.contract_id = c.id and a.status = 'active' and new_last_shipment_date is not null
                    order by amendment_no desc limit 1), c.last_shipment_date),
         coalesce((select new_expiry_date from public.export_contract_amendments a
                    where a.contract_id = c.id and a.status = 'active' and new_expiry_date is not null
                    order by amendment_no desc limit 1), c.expiry_date),
         coalesce((select new_tolerance_pct from public.export_contract_amendments a
                    where a.contract_id = c.id and a.status = 'active' and new_tolerance_pct is not null
                    order by amendment_no desc limit 1), c.tolerance_pct)
    from public.export_contracts c where c.id = p_contract;
$$;
