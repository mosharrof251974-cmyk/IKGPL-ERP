import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Attachments, ChildGrid, History, VoidDialog } from '../components/RecordParts';
import { EntityForm } from '../components/EntityForm';
import { renderCell } from '../components/DataTable';
import { Badge, Button, Card, ErrorBox, Modal, PageHeader, Spinner, Tabs } from '../components/ui';
import { ENTITIES, listSource, type ColumnDef } from '../lib/entities';
import { fetchOne, restoreRow, useAsync } from '../lib/data';
import { useAuth } from '../lib/auth';
import { cellText } from '../lib/exporters';
import { t, tf } from '../lib/i18n';
import { RECORD_PANELS } from './panels';

export default function RecordPage() {
  const { key = '', id = '' } = useParams();
  const def = ENTITIES[key];
  const { canWrite, isGM } = useAuth();
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const { data: row, error, loading, reload } = useAsync(() => fetchOne(listSource(def), id), [key, id]);

  if (!def) return <ErrorBox error={`Unknown screen "${key}"`} />;
  if (loading && !row) return <Spinner />;
  if (!row) return <ErrorBox error={error ?? 'Record not found'} />;

  const writable = canWrite(def.table) && row.status !== 'void';
  const Panel = RECORD_PANELS[def.key];
  const tabs = [
    { key: 'details', label: t('common.details') },
    ...(def.children ?? []).map((c) => ({ key: `c:${c.entity}:${c.fk}`, label: c.title ?? ENTITIES[c.entity].title })),
    { key: 'files', label: t('common.attachments') },
    { key: 'history', label: t('common.history') },
  ];
  const summary: ColumnDef[] = def.summary ?? [];

  return (
    <div>
      <PageHeader
        back={<Link to={`/m/${def.key}`} className="mb-1 inline-block text-xs text-brand-600">← {t(`nav.${def.key}`, def.title)}</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{def.titleOf ? def.titleOf(row) : def.singular} <Badge value={row.status} /></span>}
        subtitle={row.status === 'void' ? `Voided: ${row.void_reason ?? ''}` : undefined}
        actions={<>
          {writable && <Button variant="secondary" onClick={() => setEditing(true)}>✎ {t('common.edit')}</Button>}
          {writable && <Button variant="danger" onClick={() => setVoiding(true)}>{t('common.void')}</Button>}
          {row.status === 'void' && isGM && <Button variant="secondary" onClick={async () => { await restoreRow(def.table, id, def.statuses?.[0] ?? 'active'); reload(); }}>{t('common.restore')}</Button>}
        </>} />
      <ErrorBox error={error} />

      {summary.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {summary.map((c) => (
            <div key={c.key} className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">{c.label}</div>
              <div className={`text-sm font-semibold ${c.type && ['money', 'int', 'qty', 'number'].includes(c.type) ? 'tabular-nums' : ''} ${Number(row[c.key]) < 0 && c.type === 'money' ? 'text-red-700' : 'text-slate-900'}`}>
                {renderCell(c, row) || '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {Panel && <Panel row={row} reload={reload} />}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'details' && (
        <Card>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {def.fields.map((f) => {
              const v = row[f.name];
              let text: string;
              if (f.type === 'lookup') {
                const viewKey = f.name.replace(/_id$/, '_name');
                text = row[viewKey] ?? row[f.name.replace(/_id$/, '_no')] ?? (v ? '✓ linked' : '');
                if (f.name === 'contract_id') text = row.contract_no ?? text;
                if (f.name === 'import_lc_id') text = row.lc_no ?? text;
              } else if (f.type === 'checkbox') text = v ? 'Yes' : 'No';
              else if (f.type === 'tags') text = (v ?? []).join(', ');
              else if (f.type === 'select') {
                const o = f.options?.find((x) => (typeof x === 'string' ? x : x.value) === v);
                text = o ? (typeof o === 'string' ? o : o.label) : (v ?? '');
              } else text = cellText({ key: f.name, label: f.label, type: f.type === 'textarea' || f.type === 'text' ? 'text' : f.type as never }, row);
              return (
                <div key={f.name} className={f.span === 3 ? 'sm:col-span-2 lg:col-span-3' : ''}>
                  <dt className="text-xs text-slate-500">{tf(f.name, f.label)}</dt>
                  <dd className="whitespace-pre-wrap break-words text-slate-900">{text || '—'}</dd>
                </div>
              );
            })}
          </dl>
        </Card>
      )}
      {(def.children ?? []).map((c) => tab === `c:${c.entity}:${c.fk}` && (
        <ChildGrid key={tab} child={c} parent={row} parentKey={def.key} onChanged={reload} />
      ))}
      {tab === 'files' && <Attachments table={def.table} id={id} />}
      {tab === 'history' && <History table={def.table} id={id} />}

      {editing && (
        <Modal title={`${t('common.edit')} ${def.singular}`} onClose={() => setEditing(false)} wide>
          <EntityForm def={def} initial={row} onSaved={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />
        </Modal>
      )}
      {voiding && <VoidDialog table={def.table} id={id} label={def.singular} onClose={() => setVoiding(false)} onDone={() => { setVoiding(false); reload(); }} />}
    </div>
  );
}
