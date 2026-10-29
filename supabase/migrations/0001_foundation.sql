-- =====================================================================
-- 0001 FOUNDATION
-- Roles, user profiles, standard record columns, audit log,
-- no-hard-delete rule, attachments, app settings, helper functions.
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
create type public.app_role as enum (
  'gm_commercial',   -- admin: everything, approvals, user management
  'import_officer',  -- sourcing, import LC, acceptance, shipments, port clearing
  'export_officer',  -- export invoice, export docs, BL checking, bank submission
  'store',           -- goods receipt only
  'accounts',        -- payments, realization entries, reports
  'management'       -- read-only dashboard and reports
);

create table public.profiles (
  id          uuid primary key references auth.users (id),
  email       text not null,
  full_name   text,
  role        public.app_role,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Role of the signed-in user, or null if not active / no role.
create or replace function app.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function app.is_gm()
returns boolean language sql stable as $$
  select coalesce(app.current_role() = 'gm_commercial', false);
$$;

-- New sign-ups get a profile. The very first user becomes the active GM;
-- everyone after that waits for the GM to assign a role and activate them.
create or replace function app.tg_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when first_user then 'gm_commercial'::public.app_role end,
    first_user
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.tg_new_user();

-- Only the GM may change role / activation.
create or replace function app.tg_profile_guard()
returns trigger language plpgsql as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not app.is_gm() then
    raise exception 'Only GM Commercial can change user roles or activation';
  end if;
  if new.id = auth.uid() and old.role = 'gm_commercial'
     and (new.role is distinct from old.role or not new.is_active) then
    raise exception 'You cannot remove your own GM access';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function app.tg_profile_guard();

-- ---------------------------------------------------------------------
-- Table-level write permissions (role x table), editable by GM.
-- RLS policies call app.can_write(table).
-- ---------------------------------------------------------------------
create table public.role_permissions (
  table_name text not null,
  role       public.app_role not null,
  primary key (table_name, role)
);

create or replace function app.can_write(p_table text)
returns boolean language sql stable security definer set search_path = public
as $$
  select app.current_role() = 'gm_commercial'
      or exists (select 1 from public.role_permissions
                 where table_name = p_table and role = app.current_role());
$$;

create or replace function app.can_read()
returns boolean language sql stable as $$
  select app.current_role() is not null;
$$;

-- ---------------------------------------------------------------------
-- Standard columns + triggers
--   status, void_reason, voided_at, voided_by,
--   created_by, created_at, updated_by, updated_at
-- ---------------------------------------------------------------------
create or replace function app.tg_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    if new.status = 'void' then
      raise exception 'A record cannot be created as void';
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if old.status = 'void' and new.status <> 'void' and not app.is_gm() then
      raise exception 'Only GM Commercial can restore a voided record';
    end if;
    if old.status = 'void' and new.status = 'void' and new is distinct from old
       and not app.is_gm() then
      raise exception 'Voided records are locked';
    end if;
    if new.status = 'void' and old.status <> 'void' then
      if coalesce(btrim(new.void_reason), '') = '' then
        raise exception 'A reason is required to void/cancel a record';
      end if;
      new.voided_at := now();
      new.voided_by := auth.uid();
    end if;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

create or replace function app.tg_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Records are never deleted. Void/cancel the record with a reason instead.';
end $$;

-- Audit log: one row per insert/update with old and new values.
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,                   -- id (or code for code-keyed masters)
  action      text not null,          -- INSERT / UPDATE / VOID / RESTORE
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);
create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_time_idx on public.audit_log (changed_at desc);

create or replace function app.tg_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_action text := tg_op;
  v_old jsonb;
  v_new jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    if v_old = v_new then return new; end if;
    if new.status = 'void' and old.status <> 'void' then v_action := 'VOID';
    elsif old.status = 'void' and new.status <> 'void' then v_action := 'RESTORE';
    end if;
    -- keep only changed keys to save space
    select jsonb_object_agg(k, v_old -> k) into v_old
      from jsonb_object_keys(v_old) k where v_old -> k is distinct from v_new -> k;
    select jsonb_object_agg(k, v_new -> k) into v_new
      from jsonb_object_keys(v_new) k where v_new -> k is distinct from to_jsonb(old) -> k;
  end if;
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (tg_table_name, coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'code'), v_action, v_old, v_new, auth.uid());
  return new;
end $$;

-- Adds standard columns (if missing) and triggers to a table.
create or replace function app.setup_table(p_table text, p_statuses text[] default array['active','inactive','void'])
returns void language plpgsql as $$
begin
  execute format($f$
    alter table public.%1$I
      add column if not exists status      text not null default %2$L,
      add column if not exists void_reason text,
      add column if not exists voided_at   timestamptz,
      add column if not exists voided_by   uuid,
      add column if not exists created_by  uuid,
      add column if not exists created_at  timestamptz not null default now(),
      add column if not exists updated_by  uuid,
      add column if not exists updated_at  timestamptz not null default now();
    alter table public.%1$I add constraint %1$s_status_chk check (status = any (%3$L::text[]));
    create trigger %1$s_stamp  before insert or update on public.%1$I for each row execute function app.tg_stamp();
    create trigger %1$s_nodel  before delete on public.%1$I for each row execute function app.tg_no_delete();
    create trigger %1$s_audit  after insert or update on public.%1$I for each row execute function app.tg_audit();
    alter table public.%1$I enable row level security;
  $f$, p_table, p_statuses[1], p_statuses);
end $$;

-- ---------------------------------------------------------------------
-- App settings (company profile, templates, defaults) - key/value JSON
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Attachments: any record can have scanned files (PDF/JPG).
-- Files live in the private storage bucket "attachments".
-- ---------------------------------------------------------------------
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  entity_table  text not null,
  entity_id     uuid not null,
  doc_type      text,                    -- e.g. LC copy, PI, BL, Invoice
  file_name     text not null,
  storage_path  text not null unique,
  mime_type     text,
  size_bytes    bigint,
  remarks       text
);
select app.setup_table('attachments', array['active','void']);
create index attachments_entity_idx on public.attachments (entity_table, entity_id);

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function app.today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Dhaka')::date;
$$;
