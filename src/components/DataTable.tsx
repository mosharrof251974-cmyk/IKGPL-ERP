import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, inputCls } from './ui';
import { cellText, exportPdf, exportXlsx } from '../lib/exporters';
import type { ColumnDef } from '../lib/entities';
import type { Row } from '../lib/data';
import { useAuth } from '../lib/auth';
import { t } from '../lib/i18n';

const NUMERIC = ['money', 'number', 'qty', 'int', 'pct'];

export function renderCell(c: ColumnDef, r: Row): ReactNode {
  const v = c.get ? c.get(r) : r[c.key];
  if (c.type === 'status') return <Badge value={v} />;
  const text = cellText(c, r);
  if (c.currencyKey && text) return `${r[c.currencyKey] ?? ''} ${text}`;
  return text;
}

export function DataTable({ columns, rows, onRowClick, exportName, title, totals, toolbar, searchKeys, compact }: {
  columns: ColumnDef[]; rows: Row[]; onRowClick?: (r: Row) => void; exportName: string; title?: string;
  totals?: string[]; toolbar?: ReactNode; searchKeys?: string[]; compact?: boolean;
}) {
  const { company } = useAuth();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);

  const filtered = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const needle = q.toLowerCase();
      const keys = searchKeys?.length ? searchKeys : columns.map((c) => c.key);
      out = out.filter((r) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(needle))
        || columns.some((c) => cellText(c, r).toLowerCase().includes(needle)));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const num = col?.type && NUMERIC.includes(col.type);
      out = [...out].sort((a, b) => {
        const av = col?.get ? col.get(a) : a[sort.key];
        const bv = col?.get ? col.get(b) : b[sort.key];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const cmp = num ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
        return sort.asc ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, q, sort, columns, searchKeys]);

  const sheet = { name: title ?? exportName, title: title ?? exportName, columns, rows: filtered, totals };
  const totalVals = totals?.length
    ? Object.fromEntries(totals.map((k) => [k, filtered.reduce((s, r) => s + (Number(r[k]) || 0), 0)])) : null;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search') + '…'}
          className={`${inputCls} max-w-xs`} aria-label={t('common.search')} />
        {toolbar}
        <div className="ml-auto flex gap-2">
          <span className="self-center text-xs text-slate-500">{filtered.length} rows</span>
          <Button small variant="secondary" onClick={() => exportXlsx(exportName, [sheet])}>⬇ {t('common.export_excel')}</Button>
          <Button small variant="secondary" onClick={() => exportPdf(exportName, [sheet], company)}>⬇ {t('common.export_pdf')}</Button>
        </div>
      </div>

      {/* desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} onClick={() => setSort((s) => ({ key: c.key, asc: s?.key === c.key ? !s.asc : true }))}
                  className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-medium ${c.type && NUMERIC.includes(c.type) ? 'text-right' : ''}`}>
                  {c.label}{sort?.key === c.key ? (sort.asc ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400">{t('common.no_records')}</td></tr>}
            {filtered.map((r, i) => (
              <tr key={r.id ?? r.code ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`${onRowClick ? 'cursor-pointer hover:bg-brand-50/60' : ''} ${r.status === 'void' ? 'text-slate-400 line-through' : ''}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-3 ${compact ? 'py-1' : 'py-2'} ${c.type && NUMERIC.includes(c.type) ? 'text-right tabular-nums' : ''}`}>
                    {renderCell(c, r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totalVals && filtered.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold">
              <tr>{columns.map((c, i) => (
                <td key={c.key} className={`px-3 py-2 ${c.type && NUMERIC.includes(c.type) ? 'text-right tabular-nums' : ''}`}>
                  {i === 0 ? 'Total' : c.key in totalVals ? cellText(c, { [c.key]: totalVals[c.key] }) : ''}
                </td>))}</tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* phone: cards */}
      <div className="space-y-2 md:hidden">
        {filtered.length === 0 && <div className="py-6 text-center text-sm text-slate-400">{t('common.no_records')}</div>}
        {filtered.map((r, i) => (
          <div key={r.id ?? r.code ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${onRowClick ? 'active:bg-brand-50' : ''} ${r.status === 'void' ? 'opacity-60' : ''}`}>
            <div className="mb-1 font-semibold text-slate-900">{renderCell(columns[0], r)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {columns.slice(1, 9).map((c) => {
                const v = renderCell(c, r);
                if (v === '' || v === null) return null;
                return (<div key={c.key} className="min-w-0"><dt className="text-slate-500">{c.label}</dt><dd className="truncate text-slate-800">{v}</dd></div>);
              })}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
