import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ErrorBox, Field, Modal, Spinner, inputCls } from './ui';
import { DataTable } from './DataTable';
import { EntityForm } from './EntityForm';
import { entity, listSource, type ChildDef } from '../lib/entities';
import { fetchRows, signedUrl, useAsync, voidRow, type Row } from '../lib/data';
import { supabase, check } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fmtDate, humanize } from '../lib/format';
import { t } from '../lib/i18n';

export function VoidDialog({ table, id, label, onDone, onClose }: { table: string; id: string; label: string; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`${t('common.void')}: ${label}`} onClose={onClose}>
      <ErrorBox error={error} />
      <p className="mb-3 text-sm text-slate-600">Records are never deleted. The record stays in history marked as void, with your reason.</p>
      <Field label={t('common.reason')} required>
        <textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" disabled={!reason.trim()} onClick={async () => {
          try { await voidRow(table, id, reason.trim()); onDone(); } catch (e) { setError((e as Error).message); }
        }}>{t('common.void')}</Button>
      </div>
    </Modal>
  );
}

const DOC_TYPES = ['LC / Contract copy', 'Amendment', 'Proforma Invoice', 'Commercial Invoice', 'Packing List', 'Bill of Lading / AWB',
  'Bill of Entry', 'Bill of Export / Shipping Bill', 'EXP', 'UD', 'Certificate of Origin', 'Insurance', 'Test Certificate',
  'Acceptance Advice', 'Bank Advice', 'PRC', 'Auditor Certificate', 'Other'];

export function Attachments({ table, id }: { table: string; id: string }) {
  const { canWrite } = useAuth();
  const { data, error, loading, reload } = useAsync(
    () => fetchRows('v_documents', { filters: { entity_table: table, entity_id: id }, order: [{ column: 'created_at', ascending: false }] }), [table, id]);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Row | null>(null);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true); setErr(null);
    try {
      for (const f of files) {
        if (f.size > 25 * 1024 * 1024) throw new Error(`${f.name} is larger than 25 MB`);
        const path = `${table}/${id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
        const up = await supabase.storage.from('attachments').upload(path, f, { contentType: f.type, upsert: false });
        if (up.error) throw new Error(up.error.message);
        check(await supabase.from('attachments').insert({
          entity_table: table, entity_id: id, doc_type: docType, file_name: f.name, storage_path: path, mime_type: f.type, size_bytes: f.size,
        }));
      }
      reload();
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <div>
      <ErrorBox error={error || err} />
      {canWrite('attachments') && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="Document type">
            <select className={inputCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </Field>
          <label className={`inline-flex cursor-pointer items-center rounded-md bg-brand-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-800 ${busy ? 'opacity-50' : ''}`}>
            {busy ? 'Uploading…' : `⬆ ${t('common.upload')} PDF / JPG`}
            <input type="file" accept="application/pdf,image/*" multiple capture="environment" className="hidden" onChange={upload} disabled={busy} />
          </label>
        </div>
      )}
      {loading ? <Spinner /> : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
          {(data ?? []).length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-400">No files attached</li>}
          {(data ?? []).map((a) => (
            <li key={a.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${a.status === 'void' ? 'opacity-50 line-through' : ''}`}>
              <span className="font-medium">{a.file_name}</span>
              <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{a.doc_type}</span>
              <span className="text-xs text-slate-500">{fmtDate(a.created_at)} · {a.uploaded_by_name ?? ''} · {Math.ceil((a.size_bytes ?? 0) / 1024)} KB</span>
              <span className="ml-auto flex gap-1">
                <Button small variant="secondary" onClick={async () => window.open(await signedUrl(a.storage_path), '_blank')}>{t('common.open')}</Button>
                {a.status !== 'void' && canWrite('attachments') && <Button small variant="ghost" onClick={() => setVoiding(a)}>{t('common.void')}</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {voiding && <VoidDialog table="attachments" id={voiding.id} label={voiding.file_name} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); reload(); }} />}
    </div>
  );
}

export function History({ table, id }: { table: string; id: string }) {
  const { role } = useAuth();
  const { data, error, loading } = useAsync(async () => {
    const rows = await fetchRows('audit_log', { filters: { table_name: table, record_id: id }, order: [{ column: 'changed_at', ascending: false }], limit: 200 });
    const users = await fetchRows('profiles', { select: 'id,full_name,email' });
    const name = new Map(users.map((u) => [u.id, u.full_name ?? u.email]));
    return rows.map((r): Row => ({ ...r, who: name.get(r.changed_by) ?? 'system' }));
  }, [table, id]);
  if (role !== 'gm_commercial' && role !== 'management') return <p className="text-sm text-slate-500">Change history is visible to GM Commercial and Management.</p>;
  if (loading) return <Spinner />;
  return (
    <div>
      <ErrorBox error={error} />
      <ol className="space-y-2">
        {(data ?? []).map((h) => (
          <li key={h.id} className="rounded-md border border-slate-200 bg-white p-2.5 text-sm">
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-800">{humanize(h.action)}</span><span>{fmtDate(h.changed_at)}</span><span>by {h.who}</span>
            </div>
            {h.action !== 'INSERT' && h.new_data && (
              <ul className="mt-1 text-xs">
                {Object.keys(h.new_data).filter((k) => !['updated_at', 'updated_by'].includes(k)).map((k) => (
                  <li key={k}><span className="text-slate-500">{humanize(k)}:</span> <s className="text-slate-400">{String(h.old_data?.[k] ?? '—')}</s> → {String(h.new_data[k] ?? '—')}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A list of child records under a parent, with add / edit / void. */
export function ChildGrid({ child, parent, parentKey, onChanged }: { child: ChildDef; parent: Row; parentKey: string; onChanged?: () => void }) {
  const def = entity(child.entity);
  const nav = useNavigate();
  const { canWrite } = useAuth();
  const [showVoid, setShowVoid] = useState(false);
  const [editing, setEditing] = useState<Row | null | 'new'>(null);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const { data, error, loading, reload } = useAsync(() => fetchRows(listSource(def), {
    filters: { [child.fk]: parent.id, ...(showVoid || def.noCreate ? {} : { status: { op: 'neq', value: 'void' } }) },
    order: def.order ?? (def.noCreate ? [] : [{ column: 'created_at' }]),
  }), [def.key, parent.id, showVoid]);
  const presetFk = child.presetFk === undefined ? child.fk : child.presetFk;
  const fixed: Row = { ...(presetFk ? { [presetFk]: parent.id } : {}), ...(child.presets ? child.presets(parent) : {}) };
  const writable = !child.readOnly && !def.noCreate && canWrite(def.table) && parent.status !== 'void';
  const done = () => { setEditing(null); setVoiding(null); reload(); onChanged?.(); };

  return (
    <div>
      <ErrorBox error={error} />
      {loading ? <Spinner /> : (
        <DataTable columns={def.columns} rows={data ?? []} exportName={`${def.title} - ${parent.contract_no ?? parent.lc_no ?? parent.invoice_no ?? ''}`}
          title={def.title} compact
          totals={def.columns.filter((c) => c.type === 'money' || c.type === 'qty' || c.type === 'int').map((c) => c.key).filter((k) => !/no$|days|tenor|amendment_no|free_days/.test(k))}
          onRowClick={def.noCreate ? undefined : (r) => (def.detail ? nav(`/r/${def.key}/${r.id}`) : setEditing(r))}
          toolbar={<>
            {writable && <Button small onClick={() => setEditing('new')}>+ {t('common.new')} {def.singular}</Button>}
            {!def.noCreate && <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} />{t('common.show_void')}</label>}
          </>} />
      )}
      {editing && (
        <Modal title={editing === 'new' ? `${t('common.new')} ${def.singular}` : `${t('common.edit')} ${def.singular}`} onClose={() => setEditing(null)} wide>
          <EntityForm def={def} initial={editing === 'new' ? null : editing} fixed={fixed} parent={parent} parentKey={parentKey}
            onSaved={done} onCancel={() => setEditing(null)} />
          {editing !== 'new' && editing.status !== 'void' && canWrite(def.table) && (
            <div className="mt-2 border-t pt-2"><Button small variant="danger" onClick={() => { setVoiding(editing); setEditing(null); }}>{t('common.void')}</Button></div>
          )}
        </Modal>
      )}
      {voiding && <VoidDialog table={def.table} id={voiding.id} label={def.singular} onClose={() => setVoiding(null)} onDone={done} />}
    </div>
  );
}
