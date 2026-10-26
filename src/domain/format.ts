/* Small value helpers: blank checks, number parsing and en-GB formatting. */

export const blank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Parse a number from a cell or typed text ("£1,200", "620 kg"). Returns null when blank or not a number. */
export function num(v: unknown): number | null {
  if (blank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[£,\s]|gbp|kg/gi, '');
  if (s === '' || Number.isNaN(Number(s))) return null;
  return Number(s);
}

export const round2 = (x: number): number => Math.round(x * 100) / 100;

const isNum = (x: number | null | undefined): x is number => x !== null && x !== undefined && !Number.isNaN(x);

export const money = (x: number | null | undefined): string =>
  !isNum(x)
    ? '—'
    : '£' + Number(x).toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(round2(x)) ? 0 : 2, maximumFractionDigits: 2 });

export const fmtNum = (x: number | null | undefined, d = 2): string =>
  !isNum(x) ? '—' : Number(x).toLocaleString('en-GB', { maximumFractionDigits: d });

export const kg = (x: number | null | undefined): string => fmtNum(x, 2) + ' kg';

export const plural = (n: number, word: string, pluralWord?: string): string =>
  `${fmtNum(n)} ${n === 1 ? word : pluralWord || word + 's'}`;

/** Match a value case-insensitively against a list of allowed values; keeps the input when there is no match. */
export function pickCase(v: string, list: readonly string[]): string {
  if (blank(v)) return v;
  const s = v.trim().toLowerCase();
  return list.find(x => x.toLowerCase() === s) || v.trim();
}

export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
export const lowerFirst = (s: string): string => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
export const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];
