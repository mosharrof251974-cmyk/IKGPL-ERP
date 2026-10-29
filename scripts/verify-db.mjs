// Runs all migrations + seed in an in-memory Postgres (PGlite) with small
// stand-ins for Supabase's auth/storage schemas, then checks the business rules.
// Usage: npm run verify-db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const db = new PGlite();

const supabaseStubs = `
  create role authenticated; create role anon; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
`;

let failures = 0;
const ok = (msg) => console.log('  PASS', msg);
const bad = (msg) => { failures++; console.log('  FAIL', msg); };

async function as(userId, fn) {
  await db.exec(`set request.jwt.claim.sub = '${userId}'; set role authenticated;`);
  try { return await fn(); } finally { await db.exec(`reset role; reset request.jwt.claim.sub;`); }
}
async function expectError(label, sql, pattern) {
  try { await db.exec(sql); bad(`${label} (no error raised)`); }
  catch (e) { (pattern.test(e.message) ? ok : bad)(`${label} -> ${e.message.split('\n')[0]}`); }
}
const one = async (sql) => (await db.query(sql)).rows[0];

await db.exec(supabaseStubs);
const dir = join(root, 'supabase', 'migrations');
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(dir, f), 'utf8').replace(/create extension[^;]*;/i, '');
  try { await db.exec(sql); console.log('migrated', f); }
  catch (e) { console.error('MIGRATION FAILED', f, e.message); process.exit(1); }
}
await db.exec(`grant usage on schema public, app, storage, auth to authenticated;
  grant select, insert, update on all tables in schema public to authenticated;
  grant select, insert on storage.objects to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant execute on all functions in schema public to authenticated;`);

try { await db.exec(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8')); console.log('seeded'); }
catch (e) { console.error('SEED FAILED', e.message); process.exit(1); }

// users: first = GM, second = import officer
const GM = '00000000-0000-0000-0000-000000000001';
const IMP = '00000000-0000-0000-0000-000000000002';
const MGT = '00000000-0000-0000-0000-000000000003';
await db.exec(`insert into auth.users (id, email) values
  ('${GM}', 'gm@ikgpl.net'), ('${IMP}', 'import@ikgpl.net'), ('${MGT}', 'board@ikgpl.net');`);
const gmProfile = await one(`select role, is_active from profiles where id = '${GM}'`);
(gmProfile.role === 'gm_commercial' && gmProfile.is_active ? ok : bad)('first sign-up becomes active GM');
await as(GM, () => db.exec(`
  update profiles set role = 'import_officer', is_active = true where id = '${IMP}';
  update profiles set role = 'management', is_active = true where id = '${MGT}';`));

console.log('\nFigures');
await as(GM, async () => {
  const rows = (await db.query(`select contract_no, current_value, btb_entitlement, btb_opened, btb_balance,
     shipped_value, balance_to_ship, open_btb_liability, realized_value from v_export_contracts order by issue_date`)).rows;
  console.table(rows);
  const p = rows.find((r) => r.contract_no === '411011484842');
  (Number(p.btb_opened) === 1115000 ? ok : bad)(`Payper LC BTB opened 1,115,000 (got ${p.btb_opened})`);
  (Number(p.shipped_value) === 1173600 ? ok : bad)(`Payper LC shipped 1,173,600 (got ${p.shipped_value})`);

  const acc = (await db.query(`select lc_no, supplier_invoice_no, acceptance_date, bl_date, maturity_date, outstanding, payment_status
     from v_acceptances order by maturity_date`)).rows;
  console.table(acc);
  const m = acc.find((a) => a.supplier_invoice_no === 'NED-EXP-2607-118');
  (String(m.maturity_date).startsWith('2027-01-24') || new Date(m.maturity_date).toISOString().startsWith('2027-01-24')
    ? ok : bad)(`UPAS maturity = BL date + 180 = 24-Jan-2027 (got ${m.maturity_date})`);

  const l8 = await one(`select approval_status, exceeds_entitlement, status from import_lcs where application_no = 'APP-26-433'`);
  (l8.approval_status === 'pending' && l8.exceeds_entitlement ? ok : bad)('BTB above entitlement is pending GM approval');
  const l7 = await one(`select lsd_after_master from import_lcs where lc_no = 'SAMPLE-0881-26-0419'`);
  (l7.lsd_after_master ? ok : bad)('LSD after master LSD is flagged');

  console.table((await db.query(`select bill_ref_no, bill_value, due_date, realized_amount, short_realization, bill_status, days_overdue from v_export_bills`)).rows);
  console.table((await db.query(`select bank_name, facility_type, is_funded, limit_amount, currency, utilized, utilization_pct from v_bank_utilization`)).rows);
  console.table((await db.query(`select alert_type, ref_no, due_date, days_left, severity from v_alerts order by due_date`)).rows);
  console.table((await db.query(`select bl_awb_no, port, arrival_date, demurrage_risk from v_import_shipments`)).rows);
  console.table((await db.query(`select lc_no, item_name, lc_qty, received_qty, short_excess from v_lc_item_receipts order by lc_no`)).rows);
  const lic = await one(`select id from bond_licenses limit 1`);
  console.table((await db.query(`select * from bond_statement('${lic.id}', '2026-07-01', '2026-10-31')`)).rows
    .map(({ item_id, ...r }) => r));
  console.table((await db.query(`select contract_no, scheme, rate_pct, claim_amount, claim_amount_bdt, claim_status from v_incentive_claims`)).rows);
  console.table((await db.query(`select bill_ref_no, scheme from v_incentive_eligible`)).rows);
});

console.log('\nRules');
await as(IMP, async () => {
  await expectError('officer cannot open BTB above entitlement',
    `update import_lcs set status = 'opened', lc_no = 'X-1', opening_date = '2026-10-20' where application_no = 'APP-26-433'`,
    /exceed entitlement/);
  await expectError('officer cannot approve', `select approve_import_lc((select id from import_lcs where application_no = 'APP-26-433'), true)`, /Only GM/);
  await expectError('void needs a reason', `update suppliers set status = 'void' where code = 'RSM'`, /reason/);
  await expectError('no hard delete', `delete from buyers where code = 'PAYPER'`, /never deleted|permission denied/);
  await expectError('officer cannot pay (accounts role)',
    `insert into import_payments (acceptance_id, payment_date, amount, exchange_rate, source)
     select id, '2026-10-21', 1000, 122.2, 'own_fund' from acceptances where supplier_invoice_no = 'DTA-26-0812'`, /row-level security/);
  await db.exec(`update acceptances set maturity_date = '2030-01-01' where supplier_invoice_no = 'DTA-26-0812'`);
  const a = await one(`select maturity_date from acceptances where supplier_invoice_no = 'DTA-26-0812'`);
  (!String(a.maturity_date).includes('2030') ? ok : bad)('typed maturity date is overwritten by calculation');
});
await as(MGT, async () => {
  const r = await db.query(`update buyers set phone = '1' where code = 'PAYPER'`);
  (r.affectedRows === 0 ? ok : bad)('management is read-only (update affects 0 rows)');
  const n = await one(`select count(*)::int n from v_export_contracts`);
  (n.n === 3 ? ok : bad)('management can read reports');
});
await as(GM, async () => {
  await db.exec(`select approve_import_lc((select id from import_lcs where application_no = 'APP-26-433'), true, 'ok');
    update import_lcs set status = 'opened', lc_no = 'SAMPLE-0881-26-0440', opening_date = '2026-10-21' where application_no = 'APP-26-433';`);
  ok('GM approval allows opening the excess BTB');
  await expectError('proceeds cannot pay a BTB of another master LC',
    `insert into import_payments (acceptance_id, payment_date, amount, exchange_rate, source, realization_id)
     select a.id, '2026-10-21', 10, 122.2, 'export_proceeds', (select id from realizations limit 1)
       from acceptances a where supplier_invoice_no = 'DTA-26-0812'`, /same Master LC/);
  const audits = await one(`select count(*)::int n from audit_log`);
  (audits.n > 100 ? ok : bad)(`audit log populated (${audits.n} rows)`);
});

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
