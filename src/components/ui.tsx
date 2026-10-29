import { useEffect, type ReactNode } from 'react';
import { humanize } from '../lib/format';
import { t } from '../lib/i18n';

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled, small, title }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  type?: 'button' | 'submit'; disabled?: boolean; small?: boolean; title?: string;
}) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
  const size = small ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm';
  const styles = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-white text-red-700 border border-red-300 hover:bg-red-50',
    ghost: 'text-brand-600 hover:bg-brand-50',
  }[variant];
  return <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${size} ${styles}`}>{children}</button>;
}

const GOOD = ['paid', 'realized', 'pass', 'released', 'received', 'approved', 'opened', 'active', 'low', 'not_required'];
const WARN = ['pending', 'partly_paid', 'partly_realized', 'medium', 'awaiting_acceptance', 'under_audit', 'submitted', 'draft', 'in_transit'];
const BAD = ['overdue', 'high', 'discrepancy', 'rejected', 'unpaid'];
const GREY = ['void', 'closed', 'inactive', 'not_claimed'];

export function Badge({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return null;
  const v = String(value);
  const cls = BAD.includes(v) ? 'bg-red-50 text-red-700 ring-red-200'
    : WARN.includes(v) ? 'bg-amber-50 text-amber-800 ring-amber-200'
    : GOOD.includes(v) ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : GREY.includes(v) ? 'bg-slate-100 text-slate-600 ring-slate-200'
    : 'bg-brand-50 text-brand-700 ring-brand-100';
  const icon = BAD.includes(v) ? '●' : WARN.includes(v) ? '◐' : GOOD.includes(v) ? '✓' : '';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{icon && <span aria-hidden>{icon}</span>}{humanize(v)}</span>;
}

export function Card({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-xl font-semibold text-slate-900 break-words">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner() {
  return <div className="py-8 text-center text-sm text-slate-500">{t('common.loading')}</div>;
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>;
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'info' | 'good'; children: ReactNode }) {
  const cls = { warn: 'border-amber-200 bg-amber-50 text-amber-900', bad: 'border-red-200 bg-red-50 text-red-800',
                info: 'border-brand-100 bg-brand-50 text-brand-800', good: 'border-emerald-200 bg-emerald-50 text-emerald-800' }[tone];
  const icon = { warn: '⚠', bad: '⛔', info: 'ℹ', good: '✓' }[tone];
  return <div className={`mb-3 flex gap-2 rounded-md border px-3 py-2 text-sm ${cls}`}><span aria-hidden>{icon}</span><div>{children}</div></div>;
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className={`flex max-h-[95vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? 'sm:max-w-5xl' : 'sm:max-w-3xl'}`}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}>✕</button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tb) => (
        <button key={tb.key} onClick={() => onChange(tb.key)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active === tb.key ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
          {tb.label}{tb.count !== undefined && <span className="ml-1 rounded bg-slate-100 px-1.5 text-xs text-slate-600">{tb.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-xl font-semibold tabular-nums text-slate-900">{value}</div>
        {tone && <span className={`text-xs font-medium ${tone === 'bad' ? 'text-red-700' : 'text-amber-700'}`}>{tone === 'bad' ? '● attention' : '◐ watch'}</span>}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Horizontal meter for limit vs utilization: one hue, label in text ink. */
export function Meter({ pct }: { pct: number | null }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  const over = (pct ?? 0) > 100;
  const near = (pct ?? 0) >= 85;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${over ? 'bg-red-600' : near ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-14 text-right text-xs tabular-nums text-slate-700">{pct === null ? '-' : `${pct.toFixed(1)}%`}</span>
    </div>
  );
}

export function Field({ label, children, span = 1, help, required }: { label: string; children: ReactNode; span?: 1 | 2 | 3; help?: string; required?: boolean }) {
  const spanCls = span === 3 ? 'sm:col-span-2 lg:col-span-3' : span === 2 ? 'sm:col-span-2' : '';
  return (
    <label className={`block ${spanCls}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}{required && <span className="text-red-600"> *</span>}</span>
      {children}
      {help && <span className="mt-0.5 block text-xs text-slate-400">{help}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50';
