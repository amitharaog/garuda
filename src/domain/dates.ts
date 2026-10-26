/* Dates: DD-MM-YYYY text, Excel serials, "today" (frozen in tests) and working days. All dates are local midnight. */
import { blank } from './format';

export function parseDate(v: unknown): Date | null {
  if (blank(v)) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Excel serial date (1900 system)
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (d.getMonth() === +m[2] - 1 && d.getDate() === +m[1]) return d;
    return null;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO fallback
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (d: Date | null): string => (d ? `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}` : '—');
export const niceDate = (d: Date | null): string =>
  d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

let todayOverride: Date | null = null;

/** Today's date at local midnight. Tests freeze it with setToday(). */
export function today(): Date {
  if (todayOverride) return new Date(todayOverride);
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function setToday(d: Date | null): void {
  todayOverride = d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
}

export const isWeekend = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6;

/** The first working day on or after d. */
export function nextWorkingDay(d: Date): Date {
  let x = addDays(d, 0);
  while (isWeekend(x)) x = addDays(x, 1);
  return x;
}
