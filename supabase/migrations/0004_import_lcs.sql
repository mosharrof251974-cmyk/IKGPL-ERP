-- =====================================================================
-- 0004 SOURCING & IMPORT LC (BTB / local / foreign),
--      amendments, acceptance register, payment register
-- =====================================================================

create table public.import_lcs (
  id                  uuid primary key default gen_random_uuid(),
  lc_no               text unique,                 -- null until bank opens it
  application_no      text,
  application_date    date,
  contract_id         uuid references public.export_contracts (id),  -- not null = BTB
  supplier_id         uuid not null references public.suppliers (id),
  bank_id             uuid not null references public.banks (id),
  payment_type        text not null check (payment_type in ('sight', 'deferred', 'upas', 'edf', 'cash')),
  currency            text not null references public.currencies (code),
  value               numeric(18,2) not null check (value > 0),
  tolerance_pct       numeric(5,2) not null default 0,
  opening_date        date,
  last_shipment_date  date,
  expiry_date         date,
  tenor_days          int not null default 0 check (tenor_days >= 0),
  tenor_basis         text not null default 'acceptance_date'
                       check (tenor_basis in ('acceptance_date', 'bl_date')),
  incoterm            text,
  port_of_loading     text,
  port_of_discharge   text,
  goods_description   text,
  -- computed by trigger (never typed)
  exceeds_entitlement boolean not null default false,
  lsd_after_master    boolean not null default false,
  approval_status     text not null default 'not_required'
                       check (approval_status in ('not_required', 'pending', 'approved', 'rejected')),
  approved_value      numeric(18,2),
  approved_by         uuid,
  approved_at         timestamptz,
  approval_note       text,
  remarks             text,
  check (expiry_date is null or last_shipment_date is null or expiry_date >= last_shipment_date)
);
select app.setup_table('import_lcs', array['draft','opened','closed','void']);
create index import_lcs_contract_idx on public.import_lcs (contract_id);

create table public.import_lc_amendments (
  id                      uuid primary key default gen_random_uuid(),
  import_lc_id            uuid not null references public.import_lcs (id),
  amendment_no            int not null check (amendment_no > 0),
  amendment_date          date not null,
  value_change            numeric(18,2) not null default 0,
  new_last_shipment_date  date,
  new_expiry_date         date,
  description             text,
  unique (import_lc_id, amendment_no)
);
select app.setup_table('import_lc_amendments', array['active','void']);

-- Proforma invoices and their items (LC quantity = PI item quantity)
create table public.proforma_invoices (
  id            uuid primary key default gen_random_uuid(),
  pi_no         text not null,
  pi_date       date not null,
  supplier_id   uuid not null references public.suppliers (id),
  currency      text not null references public.currencies (code),
  contract_id   uuid references public.export_contracts (id),
  import_lc_id  uuid references public.import_lcs (id),
  remarks       text,
  unique (supplier_id, pi_no)
);
select app.setup_table('proforma_invoices', array['active','void']);

create table public.pi_items (
  id          uuid primary key default gen_random_uuid(),
  pi_id       uuid not null references public.proforma_invoices (id),
  item_id     uuid not null references public.items (id),
  description text,
  quantity    numeric(16,3) not null check (quantity > 0),
  unit_code   text not null references public.units (code),
  unit_price  numeric(16,6) not null check (unit_price >= 0),
  amount      numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored
);
select app.setup_table('pi_items', array['active','void']);

-- Current (amended) value / dates of an import LC
create or replace function app.import_lc_current(p_lc uuid,
  out current_value numeric, out current_lsd date, out current_expiry date)
language sql stable as $$
  select l.value + coalesce((select sum(value_change) from public.import_lc_amendments a
                              where a.import_lc_id = l.id and a.status = 'active'), 0),
         coalesce((select new_last_shipment_date from public.import_lc_amendments a
                    where a.import_lc_id = l.id and a.status = 'active' and new_last_shipment_date is not null
                    order by amendment_no desc limit 1), l.last_shipment_date),
         coalesce((select new_expiry_date from public.import_lc_amendments a
                    where a.import_lc_id = l.id and a.status = 'active' and new_expiry_date is not null
                    order by amendment_no desc limit 1), l.expiry_date)
    from public.import_lcs l where l.id = p_lc;
$$;

-- BTB opened under a master contract, in the contract currency
create or replace function app.contract_btb_opened(p_contract uuid, p_exclude uuid default null)
returns numeric language sql stable as $$
  select coalesce(sum(app.convert(
            (app.import_lc_current(l.id)).current_value, l.currency, c.currency,
            coalesce(l.opening_date, l.application_date))), 0)
    from public.import_lcs l
    join public.export_contracts c on c.id = l.contract_id
   where l.contract_id = p_contract and l.status <> 'void'
     and l.id is distinct from p_exclude;
$$;

create or replace function app.contract_btb_entitlement(p_contract uuid)
returns numeric language sql stable as $$
  select round((app.contract_current(c.id)).current_value * c.btb_entitlement_pct / 100, 2)
    from public.export_contracts c where c.id = p_contract;
$$;

-- Business rules on import LCs:
--  * BTB above entitlement needs GM approval before it can be "opened"
--  * flag LSD later than master LC's LSD
--  * only GM can approve / reject
create or replace function app.tg_import_lc_rules()
returns trigger language plpgsql as $$
declare
  c          public.export_contracts;
  v_this     numeric;
  v_total    numeric;
  v_entitled numeric;
begin
  if new.approval_status in ('approved', 'rejected')
     and (tg_op = 'INSERT' or old.approval_status is distinct from new.approval_status)
     and not app.is_gm() then
    raise exception 'Only GM Commercial can approve or reject an import LC';
  end if;

  if new.contract_id is null then
    new.exceeds_entitlement := false;
    new.lsd_after_master := false;
    if new.approval_status = 'pending' then new.approval_status := 'not_required'; end if;
    return new;
  end if;

  select * into c from public.export_contracts where id = new.contract_id;
  if c.status = 'void' then
    raise exception 'Master LC % is void', c.contract_no;
  end if;

  new.lsd_after_master := new.last_shipment_date is not null
                          and new.last_shipment_date > (app.contract_current(c.id)).current_lsd;

  v_this := app.convert(
    new.value + coalesce((select sum(value_change) from public.import_lc_amendments a
                           where a.import_lc_id = new.id and a.status = 'active'), 0),
    new.currency, c.currency, coalesce(new.opening_date, new.application_date));
  if v_this is null then
    raise exception 'No exchange rate for % on or before %. Add it in Masters > Currency Rates.',
      new.currency, coalesce(new.opening_date, new.application_date, app.today());
  end if;
  v_total    := app.contract_btb_opened(c.id, new.id) + v_this;
  v_entitled := app.contract_btb_entitlement(c.id);
  new.exceeds_entitlement := v_total > v_entitled;

  if new.status = 'void' then
    return new;
  end if;

  if new.exceeds_entitlement then
    if new.approval_status = 'approved' and app.is_gm()
       and (tg_op = 'INSERT' or old.approval_status <> 'approved') then
      new.approved_by := auth.uid();
      new.approved_at := now();
      new.approved_value := new.value;
    elsif new.approval_status = 'approved' and new.value <= coalesce(new.approved_value, 0) then
      null;  -- still within the value the GM approved
    elsif new.approval_status = 'rejected' and tg_op = 'UPDATE' and old.approval_status = 'rejected'
          and new.value = old.value then
      null;
    elsif new.approval_status <> 'rejected' or tg_op = 'INSERT' or new.value <> old.value then
      new.approval_status := 'pending';
      new.approved_value := null;
    end if;
    if new.status in ('opened', 'closed') and new.approval_status <> 'approved' then
      raise exception 'BTB total % % would exceed entitlement % % under %. Save as Draft and get GM approval first.',
        c.currency, to_char(v_total, 'FM999,999,999,990.00'),
        c.currency, to_char(v_entitled, 'FM999,999,999,990.00'), c.contract_no;
    end if;
  elsif new.approval_status = 'pending' then
    new.approval_status := 'not_required';
  end if;

  if new.status = 'opened' and (new.lc_no is null or new.opening_date is null) then
    raise exception 'LC number and opening date are required to mark the LC as opened';
  end if;
  return new;
end $$;

create trigger import_lcs_rules before insert or update on public.import_lcs
  for each row execute function app.tg_import_lc_rules();

-- GM approval RPC
create or replace function public.approve_import_lc(p_lc uuid, p_approve boolean, p_note text default null)
returns void language plpgsql as $$
begin
  if not app.is_gm() then
    raise exception 'Only GM Commercial can approve';
  end if;
  update public.import_lcs
     set approval_status = case when p_approve then 'approved' else 'rejected' end,
         approval_note = p_note,
         approved_by = auth.uid(), approved_at = now(),
         approved_value = case when p_approve then value end
   where id = p_lc;
end $$;

-- Amendments that push a BTB LC over entitlement can only be recorded by GM
create or replace function app.tg_import_lc_amendment_rules()
returns trigger language plpgsql as $$
declare
  l public.import_lcs;
  c public.export_contracts;
  v_total numeric;
begin
  select * into l from public.import_lcs where id = new.import_lc_id;
  if l.contract_id is null or new.status = 'void' or new.value_change <= 0 then
    return new;
  end if;
  select * into c from public.export_contracts where id = l.contract_id;
  v_total := app.contract_btb_opened(c.id) + app.convert(
               new.value_change - case when tg_op = 'UPDATE' and old.status = 'active' then old.value_change else 0 end,
               l.currency, c.currency, new.amendment_date);
  if v_total > app.contract_btb_entitlement(c.id) and not app.is_gm() then
    raise exception 'This amendment takes BTB under % above entitlement. GM Commercial must record it.', c.contract_no;
  end if;
  return new;
end $$;

create trigger import_lc_amendments_rules before insert or update on public.import_lc_amendments
  for each row execute function app.tg_import_lc_amendment_rules();

-- ---------------------------------------------------------------------
-- Acceptance register (documents received / accepted under an import LC)
-- maturity_date is ALWAYS calculated: basis date + LC tenor days.
-- ---------------------------------------------------------------------
create table public.acceptances (
  id                   uuid primary key default gen_random_uuid(),
  import_lc_id         uuid not null references public.import_lcs (id),
  supplier_invoice_no  text not null,
  invoice_date         date,
  document_value       numeric(18,2) not null check (document_value > 0),
  docs_received_date   date not null,
  bl_awb_no            text,
  bl_date              date,
  acceptance_date      date,
  acceptance_ref       text,
  maturity_date        date,     -- calculated by trigger
  remarks              text,
  unique (import_lc_id, supplier_invoice_no)
);
select app.setup_table('acceptances', array['active','void']);

create or replace function app.tg_acceptance_rules()
returns trigger language plpgsql as $$
declare
  l public.import_lcs;
  v_cur numeric;
  v_total numeric;
begin
  select * into l from public.import_lcs where id = new.import_lc_id;
  if l.status not in ('opened', 'closed') then
    raise exception 'Import LC % is not opened', coalesce(l.lc_no, l.application_no);
  end if;

  new.maturity_date := case
    when l.tenor_days = 0 then coalesce(new.acceptance_date, new.docs_received_date)
    when l.tenor_basis = 'bl_date' then new.bl_date + l.tenor_days
    else new.acceptance_date + l.tenor_days
  end;

  if new.status <> 'void' then
    v_cur := (app.import_lc_current(l.id)).current_value * (1 + l.tolerance_pct / 100);
    select coalesce(sum(document_value), 0) + new.document_value into v_total
      from public.acceptances where import_lc_id = l.id and status <> 'void' and id <> new.id;
    if v_total > v_cur + 0.005 then
      raise exception 'Total documents % % exceed LC value % % (incl. tolerance)',
        l.currency, to_char(v_total, 'FM999,999,999,990.00'), l.currency, to_char(v_cur, 'FM999,999,999,990.00');
    end if;
  end if;
  return new;
end $$;

create trigger acceptances_rules before insert or update on public.acceptances
  for each row execute function app.tg_acceptance_rules();

-- If an LC's tenor changes, recalculate its maturities.
create or replace function app.tg_import_lc_tenor_changed()
returns trigger language plpgsql as $$
begin
  if new.tenor_days is distinct from old.tenor_days or new.tenor_basis is distinct from old.tenor_basis then
    update public.acceptances set remarks = remarks
     where import_lc_id = new.id and status <> 'void';
  end if;
  return new;
end $$;

create trigger import_lcs_tenor after update on public.import_lcs
  for each row execute function app.tg_import_lc_tenor_changed();

-- ---------------------------------------------------------------------
-- Payment register (settles an acceptance)
-- ---------------------------------------------------------------------
create table public.import_payments (
  id               uuid primary key default gen_random_uuid(),
  acceptance_id    uuid not null references public.acceptances (id),
  payment_date     date not null,
  amount           numeric(18,2) not null check (amount > 0),   -- LC currency
  exchange_rate    numeric(14,4) not null check (exchange_rate > 0),
  amount_bdt       numeric(20,2) generated always as (round(amount * exchange_rate, 2)) stored,
  bank_charges_bdt numeric(16,2) not null default 0,
  source           text not null check (source in ('export_proceeds', 'edf', 'own_fund', 'upas', 'other')),
  realization_id   uuid,      -- FK added in 0005 (export realization that funded it)
  reference        text,
  remarks          text
);
select app.setup_table('import_payments', array['active','void']);
create index import_payments_acc_idx on public.import_payments (acceptance_id);
