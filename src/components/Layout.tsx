import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, ROLE_LABELS, type Role } from '../lib/auth';
import { t } from '../lib/i18n';

interface NavItem { to: string; key: string; roles?: Role[] }
interface NavGroup { key: string; items: NavItem[]; roles?: Role[] }

const ALL_BUT_STORE: Role[] = ['gm_commercial', 'import_officer', 'export_officer', 'accounts', 'management'];

export const NAV: NavGroup[] = [
  { key: '', items: [{ to: '/', key: 'dashboard', roles: ALL_BUT_STORE }, { to: '/alerts', key: 'alerts' }] },
  { key: 'export', roles: ALL_BUT_STORE, items: [
    { to: '/m/export_contracts', key: 'export_contracts' }, { to: '/m/export_invoices', key: 'export_invoices' },
    { to: '/m/export_bills', key: 'export_bills' }, { to: '/m/realizations', key: 'realizations' },
  ] },
  { key: 'import', items: [
    { to: '/m/proforma_invoices', key: 'proforma_invoices', roles: ALL_BUT_STORE }, { to: '/m/import_lcs', key: 'import_lcs', roles: ALL_BUT_STORE },
    { to: '/m/acceptances', key: 'acceptances', roles: ALL_BUT_STORE }, { to: '/m/import_payments', key: 'import_payments', roles: ALL_BUT_STORE },
    { to: '/m/import_shipments', key: 'import_shipments' }, { to: '/m/goods_receipts', key: 'goods_receipts' },
  ] },
  { key: 'bond', roles: ALL_BUT_STORE, items: [
    { to: '/bond', key: 'bond_statement' }, { to: '/m/bond_licenses', key: 'bond_licenses' }, { to: '/m/bond_opening_balances', key: 'bond_opening_balances' },
  ] },
  { key: 'incentive', roles: ALL_BUT_STORE, items: [
    { to: '/incentive', key: 'incentive_claims' }, { to: '/m/incentive_rates', key: 'incentive_rates' },
  ] },
  { key: 'finance', items: [
    { to: '/bank-utilization', key: 'bank_utilization', roles: ALL_BUT_STORE }, { to: '/m/bank_loans', key: 'bank_loans', roles: ALL_BUT_STORE },
    { to: '/board-pack', key: 'board_pack', roles: ALL_BUT_STORE }, { to: '/documents', key: 'documents' },
  ] },
  { key: 'masters', items: [
    { to: '/m/buyers', key: 'buyers', roles: ALL_BUT_STORE }, { to: '/m/suppliers', key: 'suppliers', roles: ALL_BUT_STORE },
    { to: '/m/banks', key: 'banks', roles: ALL_BUT_STORE }, { to: '/m/items', key: 'items' }, { to: '/m/hs_codes', key: 'hs_codes' },
    { to: '/m/cf_agents', key: 'cf_agents', roles: ALL_BUT_STORE }, { to: '/m/freight_forwarders', key: 'freight_forwarders', roles: ALL_BUT_STORE },
    { to: '/m/currency_rates', key: 'currency_rates', roles: ALL_BUT_STORE }, { to: '/m/currencies', key: 'currencies', roles: ALL_BUT_STORE },
    { to: '/m/units', key: 'units' },
  ] },
  { key: 'admin', items: [
    { to: '/import', key: 'excel_import', roles: ['gm_commercial', 'import_officer', 'export_officer', 'accounts'] },
    { to: '/admin/users', key: 'users', roles: ['gm_commercial'] }, { to: '/admin/permissions', key: 'permissions', roles: ['gm_commercial'] },
    { to: '/admin/settings', key: 'settings', roles: ['gm_commercial'] }, { to: '/admin/audit', key: 'audit_log', roles: ['gm_commercial', 'management'] },
  ] },
];

function visibleNav(role: Role | null): NavGroup[] {
  if (!role) return [];
  return NAV.filter((g) => !g.roles || g.roles.includes(role))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((g) => g.items.length);
}

function NavList({ role, onNavigate }: { role: Role | null; onNavigate?: () => void }) {
  return (
    <nav className="space-y-4 px-2 py-3 text-sm">
      {visibleNav(role).map((g) => (
        <div key={g.key || 'home'}>
          {g.key && <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-100/70">{t(`nav.${g.key}`)}</div>}
          {g.items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={onNavigate}
              className={({ isActive }) => `block rounded-md px-2 py-1.5 ${isActive ? 'bg-white/15 font-semibold text-white' : 'text-brand-50 hover:bg-white/10'}`}>
              {t(`nav.${i.key}`)}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const userBox = (
    <div className="border-t border-white/10 px-4 py-3 text-xs text-brand-100">
      <div className="truncate font-medium text-white">{profile?.full_name ?? profile?.email}</div>
      <div className="truncate">{role ? ROLE_LABELS[role] : ''}</div>
      <button onClick={signOut} className="mt-2 rounded border border-white/30 px-2 py-1 text-white hover:bg-white/10">{t('common.sign_out')}</button>
    </div>
  );
  const brand = (
    <div className="flex items-center gap-2 px-4 py-3">
      <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded" />
      <div className="leading-tight"><div className="text-sm font-semibold text-white">{t('app.name')}</div><div className="text-[11px] text-brand-100">Commercial Department</div></div>
    </div>
  );
  const bottom = [
    { to: '/', label: 'Home', icon: '⌂' }, { to: '/alerts', label: 'Alerts', icon: '⚑' },
    { to: '/m/import_lcs', label: 'LCs', icon: '⇩' }, { to: '/m/export_invoices', label: 'Export', icon: '⇧' },
  ].filter((b) => role !== 'store' || b.to === '/alerts');

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-brand-700 md:flex">
        {brand}
        <div className="flex-1 overflow-y-auto"><NavList role={role} /></div>
        {userBox}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-brand-700 px-3 py-2 text-white md:hidden" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <button onClick={() => setOpen(true)} className="rounded p-1.5 text-xl" aria-label="Menu">☰</button>
        <span className="text-sm font-semibold">{t('app.name')}</span>
        <img src="/icons/icon.svg" alt="" className="h-7 w-7 rounded" />
      </header>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-brand-700" onClick={(e) => e.stopPropagation()}>
            {brand}
            <div className="flex-1 overflow-y-auto"><NavList role={role} onNavigate={() => setOpen(false)} /></div>
            {userBox}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-8">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white md:hidden"
        style={{ gridTemplateColumns: `repeat(${bottom.length + 1}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {bottom.map((b) => (
          <NavLink key={b.to} to={b.to} end={b.to === '/'} className={({ isActive }) => `flex flex-col items-center py-1.5 text-[11px] ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-500'}`}>
            <span className="text-lg leading-none" aria-hidden>{b.icon}</span>{b.label}
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center py-1.5 text-[11px] text-slate-500"><span className="text-lg leading-none" aria-hidden>☰</span>Menu</button>
      </nav>
    </div>
  );
}
