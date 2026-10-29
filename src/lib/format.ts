// Display rules: dates DD-MMM-YYYY, amounts with thousand separators, timezone Asia/Dhaka.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const TZ = 'Asia/Dhaka';

/** Today's date in Dhaka as YYYY-MM-DD */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthStart(iso = todayISO()): string {
  return iso.slice(0, 8) + '01';
}

export function monthEnd(iso = todayISO()): string {
  const d = new Date(iso.slice(0, 8) + '01T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** '2026-10-21' or ISO timestamp -> '21-Oct-2026' */
export function fmtDate(v: unknown): string {
  if (!v) return '';
  const s = String(v);
  if (s.length > 10) {
    // timestamp: show Dhaka local date + time
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${g('day')}-${g('month')}-${g('year')} ${g('hour')}:${g('minute')}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}`;
}

/** Parses 'DD-MMM-YYYY', 'DD/MM/YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD' or an Excel serial to YYYY-MM-DD */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-\s/.]([A-Za-z]{3})[A-Za-z]*[-\s/.,]+(\d{2,4})$/.exec(s);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase() === m![2].toLowerCase());
    if (mi < 0) return null;
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

export function fmtNum(v: unknown, decimals = 2): string {
  if (v === null || v === undefined || v === '') return '';
  const n = toNum(v);
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtMoney(v: unknown, currency?: string | null, decimals = 2): string {
  if (v === null || v === undefined || v === '') return '';
  return `${currency ? currency + ' ' : ''}${fmtNum(v, decimals)}`;
}

/** Compact USD for KPI tiles: 1.2M, 450.5K */
export function fmtCompact(v: unknown): string {
  const n = toNum(v);
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

export function humanize(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
