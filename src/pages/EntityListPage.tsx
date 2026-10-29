import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataTable } from '../components/DataTable';
import { EntityForm } from '../components/EntityForm';
import { VoidDialog } from '../components/RecordParts';
import { Button, ErrorBox, Modal, PageHeader, Spinner } from '../components/ui';
import { ENTITIES, listSource } from '../lib/entities';
import { fetchRows, keyColumn, useAsync, type Filters, type Row } from '../lib/data';
import { useAuth } from '../lib/auth';
import { t } from '../lib/i18n';

export default function EntityListPage() {
  const { key = '' } = useParams();
  const def = ENTITIES[key];
  const nav = useNavigate();
  const { canWrite } = useAuth();
  const [quick, setQuick] = useState<number | null>(null);
  const [showVoid, setShowVoid] = useState(false);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [voiding, setVoiding] = useState<Row | null>(null);

  const filters: Filters = {
    ...(quick !== null && def?.quickFilters ? def.quickFilters[quick].filters : {}),
    ...(showVoid || def?.noCreate ? {} : { status: { op: 'neq', value: 'void' } }),
  };
  const { data, error, loading, reload } = useAsync(
    () => (def ? fetchRows(listSource(def), { filters, order: def.order ?? [{ column: 'created_at', ascending: false }] }) : Promise.resolve([])),
    [key, quick, showVoid]);

  if (!def) return <ErrorBox error={`Unknown screen "${key}"`} />;
  const writable = canWrite(def.table) && !def.noCreate;
  const moneyTotals = def.columns.filter((c) => c.type === 'money' && !/rate/.test(c.key)).map((c) => c.key);

  return (
    <div key={key}>
      <PageHeader title={t(`nav.${def.key}`, def.title)}
        actions={writable && <Button onClick={() => setEditing('new')}>+ {t('common.new')} {def.singular}</Button>} />
      <ErrorBox error={error} />
      {def.quickFilters && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[{ label: 'All', i: null as number | null }, ...def.quickFilters.map((q, i) => ({ label: q.label, i }))].map((q) => (
            <button key={q.label} onClick={() => setQuick(q.i)}
              className={`rounded-full px-3 py-1 text-xs ring-1 ${quick === q.i ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300'}`}>{q.label}</button>
          ))}
        </div>
      )}
      {loading ? <Spinner /> : (
        <DataTable columns={def.columns} rows={data ?? []} exportName={def.title} title={def.title} searchKeys={def.search}
          totals={moneyTotals.length && new Set((data ?? []).map((r) => r.currency ?? '')).size <= 1 ? moneyTotals : undefined}
          onRowClick={(r) => (def.detail ? nav(`/r/${def.key}/${r.id}`) : setEditing(r))}
          toolbar={!def.noCreate && <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} />{t('common.show_void')}</label>} />
      )}
      {editing && (
        <Modal title={editing === 'new' ? `${t('common.new')} ${def.singular}` : `${t('common.edit')} ${def.singular}`} onClose={() => setEditing(null)} wide>
          <EntityForm def={def} initial={editing === 'new' ? null : editing}
            onSaved={(row) => { setEditing(null); if (def.detail && editing === 'new') nav(`/r/${def.key}/${row.id}`); else reload(); }}
            onCancel={() => setEditing(null)} />
          {editing !== 'new' && editing.status !== 'void' && writable && (
            <div className="mt-2 border-t pt-2"><Button small variant="danger" onClick={() => { setVoiding(editing); setEditing(null); }}>{t('common.void')}</Button></div>
          )}
        </Modal>
      )}
      {voiding && <VoidDialog table={def.table} id={voiding[keyColumn(def.table)]} label={def.singular}
        onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); reload(); }} />}
    </div>
  );
}
