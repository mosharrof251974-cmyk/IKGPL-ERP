import { useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { Badge, Button, Card, ErrorBox, Field, Notice, PageHeader, Spinner, inputCls } from '../components/ui';
import { fetchRows, useAsync, type Row } from '../lib/data';
import { supabase, check } from '../lib/supabase';
import { ROLE_LABELS, useAuth, type Role } from '../lib/auth';
import { ENTITIES } from '../lib/entities';
import { fmtDate } from '../lib/format';

// ---------------------------------------------------------------- Users
export function UsersPage() {
  const { profile: me } = useAuth();
  const { data, error, loading, reload } = useAsync(() => fetchRows('profiles', { order: [{ column: 'created_at' }] }), []);
  const [err, setErr] = useState<string | null>(null);
  const update = async (id: string, patch: Row) => {
    setErr(null);
    try { check(await supabase.from('profiles').update(patch).eq('id', id).select('id').single()); reload(); } catch (e) { setErr((e as Error).message); }
  };
  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader title="Users" subtitle="Staff create their own account on the sign-in page; assign a role and activate them here." />
      <ErrorBox error={error || err} />
      <div className="space-y-2">
        {(data ?? []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{u.full_name ?? '—'} {u.id === me?.id && <span className="text-xs text-slate-500">(you)</span>}</div>
              <div className="truncate text-xs text-slate-500">{u.email} · joined {fmtDate(u.created_at)}</div>
            </div>
            <select className={`${inputCls} w-56`} value={u.role ?? ''} onChange={(e) => update(u.id, { role: e.target.value || null })} disabled={u.id === me?.id}>
              <option value="">— no role —</option>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={u.is_active} disabled={u.id === me?.id} onChange={(e) => update(u.id, { is_active: e.target.checked })} /> Active
            </label>
            <Badge value={u.is_active ? 'active' : 'inactive'} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Permissions matrix
const EDIT_ROLES: Role[] = ['import_officer', 'export_officer', 'store', 'accounts'];

export function PermissionsPage() {
  const { reload: reloadAuth } = useAuth();
  const { data, error, loading, reload } = useAsync(() => fetchRows('role_permissions', { select: 'table_name,role' }), []);
  const [err, setErr] = useState<string | null>(null);
  const tables = [...new Set([...Object.values(ENTITIES).filter((e) => !e.noCreate).map((e) => e.table), 'attachments'])].sort();
  const has = (t: string, r: Role) => (data ?? []).some((p) => p.table_name === t && p.role === r);
  const toggle = async (t: string, r: Role) => {
    setErr(null);
    try {
      if (has(t, r)) check(await supabase.from('role_permissions').delete().eq('table_name', t).eq('role', r).select());
      else check(await supabase.from('role_permissions').insert({ table_name: t, role: r }).select());
      reload(); reloadAuth();
    } catch (e) { setErr((e as Error).message); }
  };
  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader title="Permissions" subtitle="Who can create / edit each kind of record. GM Commercial can do everything; Management is read-only. Everyone active can read." />
      <ErrorBox error={error || err} />
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2 text-left">Table</th>{EDIT_ROLES.map((r) => <th key={r} className="px-3 py-2">{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {tables.map((t) => (
              <tr key={t}>
                <td className="px-3 py-1.5">{Object.values(ENTITIES).find((e) => e.table === t)?.title ?? t}</td>
                {EDIT_ROLES.map((r) => <td key={r} className="text-center"><input type="checkbox" checked={has(t, r)} onChange={() => toggle(t, r)} aria-label={`${t} ${r}`} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Settings & templates
function JsonSetting({ k, title, help }: { k: string; title: string; help: string }) {
  const { settings, reload } = useAuth();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  useEffect(() => { setText(JSON.stringify(settings[k] ?? {}, null, 2)); }, [settings, k]);
  const save = async () => {
    try {
      const value = JSON.parse(text);
      check(await supabase.from('app_settings').upsert({ key: k, value }).select());
      await reload();
      setMsg({ tone: 'good', text: 'Saved' });
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
  };
  return (
    <Card title={title} className="mb-4" actions={<Button small onClick={save}>Save</Button>}>
      <p className="mb-2 text-xs text-slate-500">{help}</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <textarea className={`${inputCls} font-mono text-xs`} rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
    </Card>
  );
}

export function SettingsPage() {
  const { company, settings, reload } = useAuth();
  const [c, setC] = useState<Row>({});
  const [a, setA] = useState<Row>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setC({ ...(company ?? {}) }); setA({ ...((settings.alerts as Row) ?? {}) }); }, [company, settings]);
  const save = async (key: string, value: Row) => {
    setErr(null); setMsg(null);
    try { check(await supabase.from('app_settings').upsert({ key, value }).select()); await reload(); setMsg('Saved'); }
    catch (e) { setErr((e as Error).message); }
  };
  const companyFields: [string, string][] = [['name', 'Company name'], ['tagline', 'Tagline'], ['address', 'Address'], ['phone', 'Phone'], ['email', 'E-mail'],
    ['rex_no', 'REX No.'], ['erc_no', 'ERC No.'], ['irc_no', 'IRC No.'], ['bin', 'BIN'], ['signatory', 'Authorised signatory'], ['signatory_title', 'Signatory title']];
  const alertFields: [string, string][] = [['lc_expiry_days', 'LC expiry — days ahead'], ['lsd_days', 'Last shipment date — days ahead'],
    ['maturity_days', 'Acceptance maturity — days ahead'], ['bond_days', 'Bond license expiry — days ahead'], ['incentive_pending_days', 'Incentive claim pending — days']];
  return (
    <div>
      <PageHeader title="Settings & Templates" />
      <ErrorBox error={err} />{msg && <Notice tone="good">{msg}</Notice>}
      <Card title="Company profile (used on invoices, statements, claim forms)" className="mb-4" actions={<Button small onClick={() => save('company', c)}>Save</Button>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companyFields.map(([k, l]) => <Field key={k} label={l} span={k === 'address' ? 2 : 1}><input className={inputCls} value={c[k] ?? ''} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></Field>)}
        </div>
      </Card>
      <Card title="Alerts & daily e-mail" className="mb-4" actions={<Button small onClick={() => save('alerts', {
        ...a, ...Object.fromEntries(alertFields.map(([k]) => [k, Number(a[k]) || 0])),
        recipients: String(Array.isArray(a.recipients) ? a.recipients.join(',') : a.recipients ?? '').split(/[,;\s]+/).filter(Boolean),
      })}>Save</Button>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {alertFields.map(([k, l]) => <Field key={k} label={l}><input type="number" className={inputCls} value={a[k] ?? ''} onChange={(e) => setA({ ...a, [k]: e.target.value })} /></Field>)}
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={Boolean(a.email_enabled)} onChange={(e) => setA({ ...a, email_enabled: e.target.checked })} /> Send daily e-mail</label>
          <Field label="E-mail recipients (comma separated)" span={3}>
            <input className={inputCls} value={Array.isArray(a.recipients) ? a.recipients.join(', ') : a.recipients ?? ''} onChange={(e) => setA({ ...a, recipients: e.target.value })} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">The e-mail is sent by the <code>daily-alerts</code> Edge Function (see SETUP.md for the 1-minute schedule setup).</p>
      </Card>
      <JsonSetting k="template.bond_statement" title="Template: Customs bond statement"
        help="Title lines, header fields, and the columns of each part. Column keys must be fields of the statement data. Replace with the Bond Commissionerate format." />
      <JsonSetting k="template.incentive_claim" title="Template: Cash incentive claim form"
        help="Rows of the claim form: label + data key (company.*, contract.*, buyer.*, bank.*, claim.*). Replace with your bank's claim format." />
    </div>
  );
}

// ---------------------------------------------------------------- Audit log
export function AuditLogPage() {
  const [table, setTable] = useState('');
  const { data, error, loading } = useAsync(async () => {
    const [rows, users] = await Promise.all([
      fetchRows('audit_log', { filters: table ? { table_name: table } : {}, order: [{ column: 'changed_at', ascending: false }], limit: 1000 }),
      fetchRows('profiles', { select: 'id,full_name,email' }),
    ]);
    const name = new Map(users.map((u) => [u.id, u.full_name ?? u.email]));
    return rows.map((r) => ({
      ...r, who: name.get(r.changed_by) ?? 'system',
      changes: r.action === 'INSERT' ? 'created' : Object.keys(r.new_data ?? {}).filter((k) => !['updated_at', 'updated_by'].includes(k)).join(', '),
    }));
  }, [table]);
  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Who created, changed or voided what, and when (latest 1,000)" />
      <ErrorBox error={error} />
      <div className="mb-3 max-w-xs">
        <select className={inputCls} value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">All tables</option>
          {[...new Set(Object.values(ENTITIES).map((e) => e.table))].sort().map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {loading ? <Spinner /> : (
        <DataTable exportName="Audit log" rows={data ?? []} columns={[
          { key: 'changed_at', label: 'When', type: 'date', get: (r) => r.changed_at }, { key: 'who', label: 'User' },
          { key: 'action', label: 'Action', type: 'status' }, { key: 'table_name', label: 'Table' }, { key: 'record_id', label: 'Record' },
          { key: 'changes', label: 'Fields changed' }]} />
      )}
    </div>
  );
}
