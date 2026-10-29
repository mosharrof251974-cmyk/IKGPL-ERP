-- =====================================================================
-- 0008 ROW LEVEL SECURITY, PERMISSION MATRIX, DEFAULT SETTINGS
--   * Any active user can read business data.
--   * Writes follow role_permissions (GM can write everything).
--   * No delete policy anywhere -> nothing can be hard-deleted.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'attachments','currencies','currency_rates','units','hs_codes','banks','bank_facilities',
    'buyers','suppliers','cf_agents','freight_forwarders','items',
    'export_contracts','export_contract_amendments','uds','ud_amendments','ud_items',
    'import_lcs','import_lc_amendments','proforma_invoices','pi_items','acceptances','import_payments',
    'import_shipments','goods_receipts','grn_items',
    'export_bills','export_invoices','export_invoice_items','bl_checks',
    'realizations','realization_deductions','realization_distributions',
    'bond_licenses','bond_opening_balances','incentive_rates','incentive_claims',
    'bank_loans','loan_repayments']
  loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (app.can_read())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (app.can_write(%1$L))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (app.can_write(%1$L)) with check (app.can_write(%1$L))', t);
  end loop;
end $$;

-- profiles: everyone active can see names/roles; GM manages; users may edit their own name
alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or app.can_read());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or app.is_gm()) with check (id = auth.uid() or app.is_gm());

alter table public.role_permissions enable row level security;
create policy role_permissions_read on public.role_permissions for select to authenticated using (app.can_read());
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (app.is_gm()) with check (app.is_gm());

alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select to authenticated using (app.can_read());
create policy app_settings_insert on public.app_settings for insert to authenticated with check (app.is_gm());
create policy app_settings_update on public.app_settings for update to authenticated using (app.is_gm()) with check (app.is_gm());

alter table public.audit_log enable row level security;
create policy audit_log_read on public.audit_log for select to authenticated
  using (app.current_role() in ('gm_commercial', 'management'));

create policy alert_log_read on public.alert_log for select to authenticated using (app.is_gm());

grant execute on all functions in schema app to authenticated;
grant usage on schema app to service_role;                 -- daily-alerts edge function
grant execute on all functions in schema app to service_role;
revoke delete on all tables in schema public from authenticated, anon;
grant delete on public.role_permissions to authenticated;   -- GM unticks permissions (policy: GM only)

-- ---------------------------------------------------------------------
-- Permission matrix (GM always has full access; edit in Admin > Permissions)
-- ---------------------------------------------------------------------
insert into public.role_permissions (table_name, role)
select t, r::public.app_role from (values
  ('currencies','import_officer'), ('currencies','export_officer'),
  ('units','import_officer'), ('units','export_officer'),
  ('hs_codes','import_officer'), ('hs_codes','export_officer'),
  ('items','import_officer'), ('items','export_officer'),
  ('currency_rates','accounts'), ('currency_rates','import_officer'), ('currency_rates','export_officer'),
  ('banks','accounts'), ('bank_facilities','accounts'),
  ('buyers','export_officer'),
  ('suppliers','import_officer'), ('cf_agents','import_officer'),
  ('freight_forwarders','export_officer'),
  ('export_contracts','export_officer'), ('export_contract_amendments','export_officer'),
  ('uds','export_officer'), ('ud_amendments','export_officer'), ('ud_items','export_officer'),
  ('proforma_invoices','import_officer'), ('pi_items','import_officer'),
  ('import_lcs','import_officer'), ('import_lc_amendments','import_officer'),
  ('acceptances','import_officer'),
  ('import_payments','accounts'),
  ('import_shipments','import_officer'),
  ('goods_receipts','store'), ('grn_items','store'),
  ('goods_receipts','import_officer'), ('grn_items','import_officer'),
  ('export_invoices','export_officer'), ('export_invoice_items','export_officer'),
  ('bl_checks','export_officer'), ('export_bills','export_officer'),
  ('realizations','accounts'), ('realization_deductions','accounts'), ('realization_distributions','accounts'),
  ('realizations','export_officer'), ('realization_deductions','export_officer'),
  ('bond_licenses','import_officer'), ('bond_opening_balances','import_officer'),
  ('incentive_claims','export_officer'), ('incentive_claims','accounts'),
  ('bank_loans','accounts'), ('loan_repayments','accounts'),
  ('attachments','import_officer'), ('attachments','export_officer'),
  ('attachments','store'), ('attachments','accounts')
) v(t, r);

-- ---------------------------------------------------------------------
-- Default settings
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
('company', jsonb_build_object(
   'name', 'IBRAHIM KNIT GARMENTS (PVT.) LTD.',
   'tagline', '100% EXPORT ORIENTED KNIT COMPOSITE PROJECT',
   'address', 'Ailpara, Pathantoli, Siddirganj, Narayanganj-1432, Bangladesh',
   'phone', '+880 22244 36739',
   'email', 'hrd@ikgpl.net',
   'rex_no', 'BDREX00757',
   'bin', '',
   'erc_no', '',
   'irc_no', '',
   'signatory', 'Kaniz Fatema Reema',
   'signatory_title', 'Managing Director'),
 'Company profile used on invoices, statements and claim forms'),
('alerts', jsonb_build_object(
   'email_enabled', false,
   'recipients', jsonb_build_array(),
   'lc_expiry_days', 30, 'lsd_days', 30, 'maturity_days', 15,
   'bond_days', 60, 'incentive_pending_days', 90),
 'Alert thresholds (days) and daily e-mail recipients');
