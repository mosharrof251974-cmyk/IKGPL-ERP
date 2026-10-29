// All UI text goes through t(). English lives in locales/en.json.
// To add Bangla: create locales/bn.json with the same keys and add it to DICTS.
import en from '../locales/en.json';

type Dict = { [k: string]: string | Dict };
const DICTS: Record<string, Dict> = { en: en as Dict };
let lang = 'en';
try { lang = localStorage.getItem('lang') || 'en'; } catch { /* storage unavailable */ }

function lookup(d: Dict | undefined, key: string): string | undefined {
  let cur: string | Dict | undefined = d;
  for (const part of key.split('.')) {
    if (!cur || typeof cur === 'string') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function t(key: string, fallback?: string): string {
  return lookup(DICTS[lang], key) ?? lookup(DICTS.en, key) ?? fallback ?? key;
}

/** Field label. English uses the screen's own label; other languages look up fields.<name>. */
export function tf(field: string, fallback: string): string {
  if (lang === 'en') return fallback;
  return lookup(DICTS[lang], `fields.${field}`) ?? fallback;
}

export function setLanguage(l: string) {
  try { localStorage.setItem('lang', l); } catch { /* ignore */ }
  location.reload();
}
