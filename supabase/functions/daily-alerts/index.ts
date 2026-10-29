// Daily alert e-mail. Scheduled by pg_cron (see SETUP.md), sends the v_alerts list
// to the recipients in Settings > Alerts using Resend (https://resend.com).
// Secrets: RESEND_API_KEY, ALERT_FROM (e.g. "IKGPL Commercial <alerts@yourdomain.com>"), CRON_SECRET
import { createClient } from 'jsr:@supabase/supabase-js@2';

const LABELS: Record<string, string> = {
  export_lc_expiry: 'Master LC / SC expiry', export_lsd: 'Last shipment date', import_lc_expiry: 'Import LC expiry',
  acceptance_maturity: 'Acceptance maturity due', btb_approval: 'BTB awaiting GM approval', bill_overdue: 'Export bill overdue',
  demurrage_risk: 'Demurrage risk', bond_expiry: 'Bond license expiry', incentive_pending: 'Incentive claim pending',
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d = (s: string | null) => (s ? `${s.slice(8, 10)}-${MON[Number(s.slice(5, 7)) - 1]}-${s.slice(0, 4)}` : '');
const n = (v: number | null) => (v == null ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: setting } = await sb.from('app_settings').select('value').eq('key', 'alerts').single();
  const cfg = setting?.value ?? {};
  const recipients: string[] = cfg.recipients ?? [];
  if (!cfg.email_enabled || !recipients.length) return new Response('alerts e-mail disabled or no recipients');

  const { data: alerts, error } = await sb.from('v_alerts').select('*').order('due_date');
  if (error) return new Response(error.message, { status: 500 });
  const list = alerts ?? [];
  const groups = Object.entries(list.reduce<Record<string, typeof list>>((g, a) => ((g[a.alert_type] ??= []).push(a), g), {}));
  const html = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#0f172a">
    <h2 style="color:#1e3a5f;margin:0 0 4px">Commercial alerts — ${d(new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10))}</h2>
    <p style="margin:0 0 12px;color:#475569">${list.length} item(s) need attention.</p>
    ${groups.map(([type, rows]) => `<h3 style="margin:14px 0 4px">${esc(LABELS[type] ?? type)} (${rows.length})</h3>
      <table cellpadding="5" style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0">
      <tr style="background:#f1f5f9;text-align:left"><th>Ref.</th><th>Detail</th><th>Date</th><th>Days</th><th style="text-align:right">Amount</th></tr>
      ${rows.map((r) => `<tr style="border-top:1px solid #e2e8f0${r.severity === 'high' ? ';background:#fef2f2' : ''}"><td>${esc(r.ref_no)}</td><td>${esc(r.title)}</td>
        <td>${d(r.due_date)}</td><td>${r.days_left ?? ''}</td><td style="text-align:right">${r.currency ? esc(r.currency) + ' ' : ''}${n(r.amount)}</td></tr>`).join('')}
      </table>`).join('')}
    <p style="margin-top:16px;color:#64748b;font-size:11px">Sent automatically by IKGPL Commercial ERP. Change recipients or thresholds in Admin › Settings.</p></div>`;

  let status = 'skipped (nothing due)';
  if (list.length) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('ALERT_FROM'), to: recipients, subject: `Commercial alerts: ${list.length} item(s)`, html }),
    });
    status = res.ok ? 'sent' : `failed ${res.status}: ${await res.text()}`;
  }
  await sb.from('alert_log').insert({ recipients, alert_count: list.length, status, detail: groups.map(([t, r]) => `${t}:${r.length}`).join(', ') });
  return new Response(status);
});
