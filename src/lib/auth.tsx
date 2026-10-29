import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Role = 'gm_commercial' | 'import_officer' | 'export_officer' | 'store' | 'accounts' | 'management';

export const ROLE_LABELS: Record<Role, string> = {
  gm_commercial: 'GM Commercial (Admin)',
  import_officer: 'Import Officer',
  export_officer: 'Export Officer',
  store: 'Store',
  accounts: 'Accounts / Finance',
  management: 'Management / Board',
};

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role | null;
  is_active: boolean;
}

export interface Company {
  name: string; tagline: string; address: string; phone: string; email: string;
  rex_no: string; bin: string; erc_no: string; irc_no: string; signatory: string; signatory_title: string;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  company: Company | null;
  settings: Record<string, unknown>;
  isGM: boolean;
  canWrite: (table: string) => boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setProfile(null); setPerms(new Set()); setSettings({}); setLoading(false);
      return;
    }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    setProfile(p as Profile | null);
    if (p?.role && p.is_active) {
      const [{ data: rp }, { data: st }] = await Promise.all([
        supabase.from('role_permissions').select('table_name').eq('role', p.role),
        supabase.from('app_settings').select('key,value'),
      ]);
      setPerms(new Set((rp ?? []).map((r: { table_name: string }) => r.table_name)));
      setSettings(Object.fromEntries((st ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const role = profile?.is_active ? profile.role : null;
  const isGM = role === 'gm_commercial';
  const value: AuthState = {
    session, profile, role, loading, settings,
    company: (settings.company as Company) ?? null,
    isGM,
    canWrite: (table) => isGM || (role !== null && role !== 'management' && perms.has(table)),
    reload: async () => { await load(session); },
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
