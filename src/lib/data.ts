import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, check } from './supabase';

export type Row = Record<string, any>;
export type Filters = Record<string, string | number | boolean | null | { op: 'gte' | 'lte' | 'lt' | 'gt' | 'neq' | 'in' | 'ilike'; value: unknown }>;

export interface QueryOpts {
  filters?: Filters;
  order?: { column: string; ascending?: boolean }[];
  limit?: number;
  select?: string;
}

export async function fetchRows<T = Row>(source: string, opts: QueryOpts = {}): Promise<T[]> {
  let q = supabase.from(source).select(opts.select ?? '*');
  for (const [k, v] of Object.entries(opts.filters ?? {})) {
    if (v === undefined) continue;
    if (v === null) q = q.is(k, null);
    else if (typeof v === 'object') {
      const { op, value } = v;
      if (op === 'in') q = q.in(k, value as unknown[]);
      else q = (q as any)[op](k, value);
    } else q = q.eq(k, v);
  }
  for (const o of opts.order ?? []) q = q.order(o.column, { ascending: o.ascending ?? true, nullsFirst: false });
  q = q.limit(opts.limit ?? 5000);
  return check(await q) as unknown as T[];
}

export async function fetchOne<T = Row>(source: string, id: string): Promise<T | null> {
  const res = await supabase.from(source).select('*').eq('id', id).maybeSingle();
  return check(res) as T | null;
}

/** Inserts or updates; returns the saved row. Empty strings become null. */
export const keyColumn = (table: string) => (table === 'units' || table === 'currencies' ? 'code' : 'id');

export async function saveRow(table: string, values: Row, id?: string | null): Promise<Row> {
  const clean: Row = {};
  for (const [k, v] of Object.entries(values)) clean[k] = v === '' ? null : v;
  const res = id
    ? await supabase.from(table).update(clean).eq(keyColumn(table), id).select().single()
    : await supabase.from(table).insert(clean).select().single();
  invalidateOptions(table);
  return check(res) as Row;
}

export async function voidRow(table: string, id: string, reason: string): Promise<void> {
  check(await supabase.from(table).update({ status: 'void', void_reason: reason }).eq(keyColumn(table), id).select('status').single());
  invalidateOptions(table);
}

export async function restoreRow(table: string, id: string, status: string): Promise<void> {
  check(await supabase.from(table).update({ status, void_reason: null }).eq(keyColumn(table), id).select('status').single());
  invalidateOptions(table);
}

// ---- lookup options (cached per session, refreshed after saves)
export interface LookupDef {
  table: string;
  select?: string;
  label: string | ((r: Row) => string);
  filters?: Filters;
  order?: string;
}
export interface Option { value: string; label: string; row: Row }
const optionCache = new Map<string, Promise<Option[]>>();

function invalidateOptions(table: string) {
  for (const k of [...optionCache.keys()]) if (k.startsWith(table + '|')) optionCache.delete(k);
}

export function loadOptions(def: LookupDef): Promise<Option[]> {
  const key = `${def.table}|${def.select ?? ''}|${JSON.stringify(def.filters ?? {})}`;
  if (!optionCache.has(key)) {
    const labelOf = typeof def.label === 'string' ? (r: Row) => String(r[def.label as string] ?? '') : def.label;
    const p = fetchRows(def.table, {
      select: def.select ?? `id,status,${typeof def.label === 'string' ? def.label : 'id'}`,
      filters: { status: { op: 'neq', value: 'void' }, ...(def.filters ?? {}) },
      order: [{ column: def.order ?? (typeof def.label === 'string' ? def.label : 'created_at') }],
    }).then((rows) => rows.map((r) => ({ value: String(r.id ?? r.code), label: labelOf(r), row: r })));
    p.catch(() => optionCache.delete(key));
    optionCache.set(key, p);
  }
  return optionCache.get(key)!;
}

// ---- generic async hook
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fnRef.current()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { data, error, loading, reload, setData };
}

export async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
