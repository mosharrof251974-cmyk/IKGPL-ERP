import { createClient } from '@supabase/supabase-js';

/**
 * Accepts the project URL however it was pasted into Netlify: with quotes or spaces,
 * a trailing "/" or "/rest/v1", or the dashboard link (supabase.com/dashboard/project/<ref>).
 */
function cleanUrl(raw: string | undefined): string {
  let u = (raw ?? '').trim().replace(/^["']|["']$/g, '').trim();
  const dash = /supabase\.com\/dashboard\/project\/([a-z0-9]+)/i.exec(u);
  if (dash) return `https://${dash[1]}.supabase.co`;
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/(rest|auth)\/v1.*$/i, '').replace(/\/+$/, '');
}

export const supabaseUrl = cleanUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const key = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim().replace(/^["']|["']$/g, '');

export const isConfigured = Boolean(supabaseUrl && key);
export const supabase = createClient(supabaseUrl || 'http://localhost:54321', key || 'not-configured');

/** Checks the server before sign-in so "Failed to fetch" can be explained in plain words. */
export async function diagnoseServer(): Promise<string | null> {
  if (!isConfigured) return 'The website has no database address. In Netlify add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy.';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
    return `The database address "${supabaseUrl}" does not look right. It should be like https://abcdefgh.supabase.co (Supabase › Project Settings › API › Project URL).`;
  }
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: key } });
    if (res.status === 401 || res.status === 403) return 'The database rejected the key. Re-copy VITE_SUPABASE_ANON_KEY (the "anon public" key) into Netlify and redeploy.';
    if (!res.ok) return `The database server answered with error ${res.status}. Open the project in Supabase and check it is running (not paused).`;
    return null;
  } catch {
    return `Cannot reach ${supabaseUrl}. Either the Project URL is mistyped or the Supabase project is paused — open supabase.com and click "Restore project" if it is paused.`;
  }
}

/** Throws the Postgres/PostgREST message so pages can show business-rule errors as-is. */
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
