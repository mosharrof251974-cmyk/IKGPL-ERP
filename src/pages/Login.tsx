import { useEffect, useState, type FormEvent } from 'react';
import { diagnoseServer, supabase, supabaseUrl } from '../lib/supabase';
import { Button, ErrorBox, Field, Notice, inputCls } from '../components/ui';
import { t } from '../lib/i18n';

/** Created in the database by supabase/login_account.sql — keep both in step. */
export const DEFAULT_LOGIN = { email: 'admin@ikgpl.net', password: 'Ikgpl@2026' };

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  useEffect(() => { diagnoseServer().then(setServerProblem); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (error) throw error;
        if (!data.session) setInfo(t('auth.check_email'));
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        setInfo(t('auth.reset_sent'));
      }
    } catch (x) {
      const msg = (x as Error).message;
      if (/failed to fetch|networkerror|load failed/i.test(msg)) setError((await diagnoseServer()) ?? `Could not connect to ${supabaseUrl}. Check your internet connection and try again.`);
      else if (/invalid login credentials/i.test(msg)) setError('Wrong login ID or password. If this is a new database, run supabase/login_account.sql in the Supabase SQL Editor first.');
      else setError(msg);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-700 to-brand-800 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <img src="/icons/icon.svg" alt="" className="h-11 w-11 rounded-lg" />
          <div><div className="font-semibold text-slate-900">{t('app.name')}</div><div className="text-xs text-slate-500">{t('app.company')}</div></div>
        </div>
        {serverProblem && <Notice tone="bad">{serverProblem}</Notice>}
        <ErrorBox error={error} />
        {info && <Notice tone="good">{info}</Notice>}
        <form onSubmit={submit} className="space-y-3">
          {mode === 'up' && <Field label={t('auth.full_name')} required><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
          <Field label={t('auth.email')} required><input type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          {mode !== 'reset' && <Field label={t('auth.password')} required><input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} minLength={8} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>}
          <Button type="submit" disabled={busy}>{busy ? '…' : mode === 'in' ? t('auth.sign_in') : mode === 'up' ? t('auth.sign_up') : 'Send reset link'}</Button>
        </form>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-brand-600">
          {mode !== 'in' && <button onClick={() => setMode('in')}>{t('auth.sign_in')}</button>}
          {mode !== 'up' && <button onClick={() => setMode('up')}>{t('auth.sign_up')}</button>}
          {mode !== 'reset' && <button onClick={() => setMode('reset')}>{t('auth.forgot')}</button>}
        </div>
      </div>
      <div className="mt-4 w-full max-w-sm rounded-xl border border-white/20 bg-white/10 p-4 text-sm text-white">
        <div className="mb-2 font-semibold">Login details</div>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1">
          <dt className="text-brand-100">Login ID</dt><dd className="select-all font-mono">{DEFAULT_LOGIN.email}</dd>
          <dt className="text-brand-100">Password</dt><dd className="select-all font-mono">{DEFAULT_LOGIN.password}</dd>
        </dl>
        <button type="button" onClick={() => { setMode('in'); setEmail(DEFAULT_LOGIN.email); setPassword(DEFAULT_LOGIN.password); }}
          className="mt-3 w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
          Use these details
        </button>
        <p className="mt-2 break-all text-[11px] text-brand-100">Server: {supabaseUrl || 'not set'}</p>
      </div>
    </div>
  );
}

export function PendingApproval({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow">
        <div className="mb-2 text-3xl" aria-hidden>⏳</div>
        <p className="mb-1 font-medium">{email}</p>
        <p className="mb-4 text-sm text-slate-600">{t('auth.pending')}</p>
        <Button variant="secondary" onClick={onSignOut}>{t('common.sign_out')}</Button>
      </div>
    </div>
  );
}
