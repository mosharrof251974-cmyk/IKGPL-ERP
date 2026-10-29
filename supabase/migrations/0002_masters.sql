-- =====================================================================
-- 0002 MASTERS
-- currencies & rates, banks & facilities, buyers, suppliers, C&F agents,
-- freight forwarders, HS codes, units, items/materials
-- =====================================================================

create table public.currencies (
  code      text primary key check (code ~ '^[A-Z]{3}$'),
  name      text not null,
  symbol    text,
  decimals  int not null default 2
);
select app.setup_table('currencies');

-- Rate = how many BDT for 1 unit of the currency, on a date.
create table public.currency_rates (
  id            uuid primary key default gen_random_uuid(),
  currency_code text not null references public.currencies (code),
  rate_date     date not null,
  rate_to_bdt   numeric(14,4) not null check (rate_to_bdt > 0),
  source        text,
  unique (currency_code, rate_date)
);
select app.setup_table('currency_rates', array['active','void']);

-- Latest active rate on or before a date (BDT = 1).
create or replace function app.rate_on(p_currency text, p_date date default null)
returns numeric language sql stable as $$
  select case when p_currency = 'BDT' then 1::numeric else (
    select rate_to_bdt from public.currency_rates
     where currency_code = p_currency and status = 'active'
       and rate_date <= coalesce(p_date, app.today())
     order by rate_date desc limit 1)
  end;
$$;

create or replace function app.convert(p_amount numeric, p_from text, p_to text, p_date date default null)
returns numeric language sql stable as $$
  select case
    when p_amount is null then null
    when p_from = p_to then p_amount
    else round(p_amount * app.rate_on(p_from, p_date) / nullif(app.rate_on(p_to, p_date), 0), 2)
  end;
$$;

create table public.units (
  code  text primary key,
  name  text not null
);
select app.setup_table('units');

create table public.hs_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  description  text not null,
  unit_code    text references public.units (code),
  remarks      text
);
select app.setup_table('hs_codes');

create table public.banks (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  short_name      text,
  branch          text,
  address         text,
  country         text not null default 'Bangladesh',
  swift_code      text,
  is_local        boolean not null default true,
  -- what this bank does for us: lien, issuing, advising, negotiating, opening
  bank_roles      text[] not null default '{}',
  account_no      text,
  contact_person  text,
  phone           text,
  email           text,
  remarks         text,
  unique (name, branch)
);
select app.setup_table('banks');

create type public.facility_type as enum ('BTB', 'EDF', 'PC', 'FDBP', 'UPAS', 'OTHER');

create table public.bank_facilities (
  id             uuid primary key default gen_random_uuid(),
  bank_id        uuid not null references public.banks (id),
  facility_type  public.facility_type not null,
  is_funded      boolean not null,
  limit_amount   numeric(18,2) not null check (limit_amount >= 0),
  currency       text not null references public.currencies (code),
  valid_from     date,
  valid_to       date,
  sanction_ref   text,
  remarks        text
);
select app.setup_table('bank_facilities');

create table public.buyers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,
  name            text not null unique,
  address         text,
  country         text,
  market          text,           -- used for cash incentive rate lookup (EU, USA, UK, ...)
  contact_person  text,
  email           text,
  phone           text,
  vat_no          text,
  default_payment_terms text,
  remarks         text
);
select app.setup_table('buyers');

create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,
  name            text not null unique,
  origin          text not null check (origin in ('local', 'foreign')),
  category        text,           -- yarn, fabric, dyes & chemicals, accessories, packing
  country         text,
  address         text,
  contact_person  text,
  email           text,
  phone           text,
  bin_vat_no      text,
  bank_details    text,
  remarks         text
);
select app.setup_table('suppliers');

create table public.cf_agents (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  license_no      text,
  ports           text[] not null default '{}',
  address         text,
  contact_person  text,
  phone           text,
  email           text,
  remarks         text
);
select app.setup_table('cf_agents');

create table public.freight_forwarders (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  license_no      text,
  address         text,
  contact_person  text,
  phone           text,
  email           text,
  remarks         text
);
select app.setup_table('freight_forwarders');

create table public.items (
  id           uuid primary key default gen_random_uuid(),
  code         text unique,
  name         text not null,
  category     text not null,    -- yarn, fabric, dyes, chemicals, accessories, packing
  unit_code    text not null references public.units (code),
  hs_code_id   uuid references public.hs_codes (id),
  is_bonded    boolean not null default true,   -- appears on customs bond statement
  description  text,
  unique (name, category)
);
select app.setup_table('items');
