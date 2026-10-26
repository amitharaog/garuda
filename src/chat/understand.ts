/* Rule-based, deterministic language understanding for the booking chat. No API key, no network.
   Built for the fixed allowed values in the brief: numbers, £ amounts, kg/g, units per carton, dates,
   priorities, appointment yes/no, seller name and multiple products. Port of the prototype's chat.js `understand`. */
import { ALLOWED, CITY_TO_COUNTRY } from '../domain/reference';
import { addDays, fmtDate, today } from '../domain/dates';

// ---------------- vocabulary ----------------
const WORDNUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, another: 1, single: 1, couple: 2, dozen: 12,
};
const NUMW = '(\\d[\\d,]*(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|another|single|couple|dozen)';
export const toNum = (s: string | undefined | null): number | null => {
  if (s === undefined || s === null) return null;
  const t = String(s).toLowerCase().trim();
  if (WORDNUM[t] !== undefined) return WORDNUM[t];
  const n = Number(t.replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const UK_CITIES: readonly string[] = ALLOWED.originCity;
export const EU_CITIES: readonly string[] = Object.keys(CITY_TO_COUNTRY);

const COUNTRY_ALIASES: ReadonlyArray<[RegExp, string]> = [
  [/\b(united kingdom|u\.?k\.?|great britain|britain|england|scotland|wales|gb)\b/i, 'United Kingdom'],
  [/\b(china|prc|chinese)\b/i, 'China'], [/\b(india|indian)\b/i, 'India'], [/\b(vietnam|viet nam|vietnamese)\b/i, 'Vietnam'],
  [/\b(turkey|t[uü]rkiye|turkish)\b/i, 'Turkey'], [/\b(germany|german|deutschland)\b/i, 'Germany'],
  [/\b(france|french)\b/i, 'France'], [/\b(netherlands|holland|dutch)\b/i, 'Netherlands'], [/\b(italy|italian)\b/i, 'Italy'],
  [/\b(spain|spanish)\b/i, 'Spain'], [/\b(usa|u\.s\.a?\.?|united states|america)\b/i, 'United States'], [/\b(bangladesh)\b/i, 'Bangladesh'],
  [/\b(pakistan)\b/i, 'Pakistan'], [/\b(japan)\b/i, 'Japan'], [/\b(portugal)\b/i, 'Portugal'], [/\b(poland)\b/i, 'Poland'],
];
const DEST_COUNTRY_RE: ReadonlyArray<[RegExp, string]> = [[/\b(germany|deutschland)\b/i, 'Germany'], [/\b(france)\b/i, 'France'], [/\b(netherlands|holland|the nl)\b/i, 'Netherlands']];
export function findCountry(t: string): string | null {
  for (const [re, c] of COUNTRY_ALIASES) if (re.test(t)) return c;
  return null;
}

export const ITEM_KEYS = ['sku', 'description', 'hs', 'qty', 'unitPrice', 'upc', 'cartons', 'unitWeight', 'origin'] as const;
export type ChatItemKey = (typeof ITEM_KEYS)[number];
export const isItemKey = (f: string): f is ChatItemKey => (ITEM_KEYS as readonly string[]).includes(f);

// ---------------- date parsing ----------------
export interface ParsedDate {
  date: Date;
  span: string;
  rel?: boolean;
  assumed?: string;
}

export function parseDateText(t: string, base: Date = today()): ParsedDate | null {
  const s = t.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/))) {
    let y = +m[3];
    if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (d.getDate() === +m[1]) return { date: d, span: m[0] };
  }
  if ((m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/))) return { date: new Date(+m[1], +m[2] - 1, +m[3]), span: m[0] };
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
  const yearFix = (d: Date, hadYear: boolean) => { if (!hadYear && d < base) d.setFullYear(d.getFullYear() + 1); return d; };
  if ((m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${mon}(?:,?\\s+(\\d{4}))?`)))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3));
    return { date: yearFix(new Date(m[3] ? +m[3] : base.getFullYear(), mi, +m[1]), !!m[3]), span: m[0] };
  }
  if ((m = s.match(new RegExp(`\\b${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`)))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    return { date: yearFix(new Date(m[3] ? +m[3] : base.getFullYear(), mi, +m[2]), !!m[3]), span: m[0] };
  }
  if ((m = s.match(/\bday after tomorrow\b/))) return { date: addDays(base, 2), span: m[0], rel: true };
  if ((m = s.match(/\btomorrow\b/))) return { date: addDays(base, 1), span: m[0], rel: true };
  if ((m = s.match(/\b(today|now|right away|immediately)\b/)) && /\b(ready|ship|collect|pick|today)\b/.test(s)) return { date: new Date(base), span: m[0], rel: true };
  if ((m = s.match(new RegExp(`\\bin\\s+${NUMW}\\s+(days?|weeks?)\\b`)))) {
    const n = toNum(m[1]) || 1;
    return { date: addDays(base, /week/.test(m[2]) ? n * 7 : n), span: m[0], rel: true };
  }
  if ((m = s.match(/\b(next|this|on|coming|the)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    // The next such weekday after today ("next Monday" on a Monday is a week away).
    const target = DAYS.indexOf(m[2]);
    let d = addDays(base, 1);
    while (d.getDay() !== target) d = addDays(d, 1);
    return { date: d, span: m[0], rel: true };
  }
  if ((m = s.match(/\bnext week\b/))) {
    let d = addDays(base, 1);
    while (d.getDay() !== 1) d = addDays(d, 1);
    return { date: d, span: m[0], rel: true, assumed: 'Monday next week' };
  }
  if ((m = s.match(/\b(end of (the|this) week)\b/))) {
    let d = new Date(base);
    while (d.getDay() !== 5) d = addDays(d, 1);
    return { date: d, span: m[0], rel: true };
  }
  return null;
}

// ---------------- message understanding ----------------
export type ItemRef = number | 'cur';
export interface FieldSet {
  field: string;
  value?: string | number | null;
  delta?: number;
  item?: ItemRef;
  stated?: boolean;
  rel?: string | null;
  cartonScope?: 'booking' | 'auto' | 'item' | 'itemDelta';
  fromPending?: boolean;
}
export interface NewProduct {
  qty: number | null;
  description: string;
}
export type Command = 'reset' | 'undo' | 'help' | 'review' | 'confirm' | 'noMoreItems' | 'addItem' | 'repeatLast';
export interface Understood {
  sets: FieldSet[];
  items: NewProduct[];
  cmd: Command | null;
  removeItem?: number;
}
export interface Pending {
  field: string;
  item?: number;
}
export interface UnderstandContext {
  b: { pallets: number | null; cartons: number | null };
  items: Array<{ sku: string; description: string }>;
  pending?: Pending | null;
  suggestHS?: { code: string; item: number } | null;
  estimate?: number | null;
}

export const singular = (w: string) => w.replace(/(ies)$/, 'y').replace(/(ses|xes|ches|shes)$/, m => m.slice(0, -2)).replace(/s$/, '');

/** Find which item a phrase refers to: "item 2", a SKU, or the best word overlap with a description. */
export function resolveItem(ref: string, items: UnderstandContext['items']): number | null {
  if (!items || !items.length) return null;
  const r = String(ref || '').toLowerCase();
  const m = r.match(/\b(?:item|line|product)\s*#?\s*(\d+)\b/);
  if (m && items[+m[1] - 1]) return +m[1] - 1;
  for (let i = 0; i < items.length; i++) {
    const sku = items[i].sku;
    if (sku && new RegExp(`\\b${sku.toLowerCase().replace(/[-/]/g, '[-\\/ ]?')}\\b`).test(r)) return i;
  }
  const words = r.split(/[^a-z0-9]+/).filter(w => w.length >= 3).map(singular);
  let best: number | null = null, bestScore = 0;
  items.forEach((it, i) => {
    const dw = String(it.description || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3).map(singular);
    const sc = words.filter(w => dw.includes(w)).length;
    if (sc > bestScore) { bestScore = sc; best = i; }
  });
  return best;
}

export function understand(text: string, ctx: UnderstandContext): Understood {
  const out: Understood = { sets: [], items: [], cmd: null };
  const orig = text.trim();
  // Working copy: matched spans are blanked out so later patterns do not reuse them.
  let t = ' ' + orig.replace(/\s+/g, ' ') + ' ';
  const lower = () => t.toLowerCase();
  const consume = (span: string) => {
    const i = lower().indexOf(span.toLowerCase());
    if (i >= 0) t = t.slice(0, i) + ' '.repeat(span.length) + t.slice(i + span.length);
  };
  const L = orig.toLowerCase();
  const pend = ctx.pending || null;

  // ---- commands
  if (/^\s*(start over|restart|reset|new booking|clear( all)?|begin again)\s*[.!]*\s*$/i.test(orig)) { out.cmd = 'reset'; return out; }
  if (/^\s*(undo|go back|revert)( that| last( change)?)?\s*[.!]*\s*$/i.test(orig)) { out.cmd = 'undo'; return out; }
  if (/^\s*(help|what can you do|\?)\s*$/i.test(orig)) { out.cmd = 'help'; return out; }
  if (/^\s*(repeat|copy|duplicate|same as)\s+(my\s+|the\s+)?last(\s+(booking|shipment|one|time|week))?\s*[.!]*\s*$/i.test(orig)) { out.cmd = 'repeatLast'; return out; }
  if (/^\s*(show|view|see)?\s*(me\s*)?(the\s*)?(summary|booking|status|review|checks?)\s*[.!?]*\s*$/i.test(orig)) { out.cmd = 'review'; return out; }
  if (/^\s*(confirm|book it|book now|go ahead|looks good,? book|yes,? (confirm|book)|confirm booking|place (the )?booking|proceed)\b/i.test(orig)) { out.cmd = 'confirm'; return out; }
  if (
    /^\s*(that'?s (all|everything|it)|no more|nothing else|only (that|this|one)( product)?|just (that|this|the one)|done adding|no other products?)\s*[.!]*\s*$/i.test(orig) ||
    (pend?.field === 'moreItems' && /^\s*(no|nope|that'?s it|none|no,? that'?s (all|it|everything))\b/i.test(orig))
  ) { out.cmd = 'noMoreItems'; return out; }
  if (
    /^\s*(add (another|a new|one more) (product|item|sku|line)|another product|more products?|yes,? (add|another|there'?s more))\b/i.test(orig) ||
    (pend?.field === 'moreItems' && /^\s*(yes|yeah|yep|y)\s*[.!]*\s*$/i.test(orig))
  ) out.cmd = 'addItem';
  let m: RegExpMatchArray | null;
  if ((m = orig.match(/\b(?:remove|delete|drop|take out)\s+(?:the\s+)?(?:item|product|line|sku)?\s*(.+?)\s*(?:from (?:the )?(?:shipment|booking))?\s*[.!]*$/i)) && !/pallet|carton|box/i.test(m[1])) {
    const idx = resolveItem(m[0], ctx.items);
    if (idx !== null) { out.removeItem = idx; return out; }
  }
  if (/\buse (?:the )?(?:suggested|suggestion|that)(?: hs)?(?: code)?\b/i.test(orig) && ctx.suggestHS) {
    out.sets.push({ field: 'hs', value: ctx.suggestHS.code, item: ctx.suggestHS.item });
    return out;
  }
  if (/\buse (?:the |your )?estimate\b/i.test(orig) && ctx.estimate) { out.sets.push({ field: 'grossWeight', value: ctx.estimate }); return out; }
  if ((m = orig.match(/\b(?:use|choose|pick|switch to|go with|i want)\s+carrier\s+([abc])\b/i))) { out.sets.push({ field: 'carrier', value: 'Carrier ' + m[1].toUpperCase() }); return out; }
  if (/\b(use|go with|back to) (the |your )?recommend(ed|ation)\b/i.test(orig)) { out.sets.push({ field: 'carrier', value: null }); return out; }

  // ---- explicit "set X to Y" / "X is Y" edits
  const setRe = /(?:^|[,.;]\s*|\band\s+)(?:please\s+)?(?:set|change|update|make|correct|fix|amend|edit|put)\s+(?:the\s+)?(.{2,60}?)\s+(?:to|=|as|into|at)\s+(.+?)(?=(?:[,;]|\.\s|\band (?:set|change|update|make)\b|$))/gi;
  let edits: Array<[string, string, string]> = [...orig.matchAll(setRe)].map(x => [x[1], x[2], x[0]]);
  if (!edits.length) {
    const isRe = /^\s*(?:actually,?\s*|sorry,?\s*|oh,?\s*|correction:?\s*)?(?:the\s+)?([a-z][a-z \-'0-9]{1,50}?)\s+(?:is|are|should be|=|was meant to be|needs to be)\s+(.+?)\s*[.!]*$/i;
    if ((m = orig.match(isRe))) edits = [[m[1], m[2], m[0]]];
  }
  for (const [lhs, rhs, whole] of edits) {
    const r = resolveFieldEdit(lhs, rhs, ctx);
    if (r) { out.sets.push(...r); consume(whole); }
  }
  if (out.sets.length && t.replace(/[\s,.;!]/g, '').length < 3) return out;

  // ---- increments: add / remove pallets or cartons
  const incRes: Array<[RegExp, 1 | -1, boolean?]> = [
    [new RegExp(`\\b(?:add|plus|put on|include|need|use)\\s+(?:${NUMW}\\s+)?(?:more|extra|additional|other)?\\s*(pallets?|cartons?|boxes)\\b`, 'gi'), +1],
    [new RegExp(`\\b${NUMW}\\s+(?:more|extra|additional)\\s+(pallets?|cartons?|boxes)\\b`, 'gi'), +1],
    [new RegExp(`\\b(?:remove|take (?:off|away)|drop|minus|subtract|lose|less)\\s+(?:${NUMW}\\s+|the\\s+)?(?:of\\s+the\\s+)?(pallets?|cartons?|boxes)\\b`, 'gi'), -1],
    [new RegExp(`\\b${NUMW}\\s+(?:fewer|less)\\s+(pallets?|cartons?|boxes)\\b`, 'gi'), -1],
    [new RegExp(`\\b(?:increase|raise|bump)\\s+(?:the\\s+)?(pallets?|cartons?)\\s+by\\s+${NUMW}`, 'gi'), +1, true],
    [new RegExp(`\\b(?:decrease|reduce|lower|cut)\\s+(?:the\\s+)?(pallets?|cartons?)\\s+by\\s+${NUMW}`, 'gi'), -1, true],
  ];
  for (const [re, sign, rev] of incRes) {
    for (const mm of [...lower().matchAll(re)]) {
      let n: number | null, what: string;
      if (rev) { what = mm[1]; n = toNum(mm[2]); }
      else if (mm[2] !== undefined) { n = toNum(mm[1]); what = mm[2]; }
      else { n = 1; what = mm[1]; }
      if (n === null) n = 1;
      const field = /pallet/.test(what) ? 'pallets' : 'cartons';
      const cur = field === 'pallets' ? ctx.b.pallets : ctx.b.cartons;
      const iref = field === 'cartons' ? resolveItem(orig.replace(/cartons?|boxes/gi, ''), ctx.items) : null;
      if (field === 'cartons' && iref !== null) out.sets.push({ field, delta: sign * n, item: iref, cartonScope: 'itemDelta' });
      // "add 3 pallets" when nothing is set yet is a value, not an increment
      else if (sign > 0 && (cur === null || cur === undefined)) out.sets.push({ field, value: n, stated: true });
      else out.sets.push({ field, delta: sign * n, stated: true });
      consume(mm[0]);
    }
  }

  // ---- dates
  const dateKw = /\b(ready|ship|shipping|collect|collection|pick ?up|pickup|dispatch|date|leave|leaving|go out|send(ing)?|packed|on|from|by|next|tomorrow|today|week|in \d+ days?)\b/i;
  const dt = parseDateText(lower(), today());
  if (dt && (pend?.field === 'readyDate' || dateKw.test(L) || /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(L) || /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i.test(dt.span))) {
    out.sets.push({ field: 'readyDate', value: fmtDate(dt.date), rel: dt.rel ? dt.span.trim() : null });
    consume(dt.span);
  }

  // ---- money
  const moneyRe = /(?:£\s*(\d[\d,]*(?:\.\d+)?)\s*(k\b)?|(\d[\d,]*(?:\.\d+)?)\s*(k\s*)?(?:gbp|pounds?|quid|sterling)\b)/gi;
  for (const mm of [...lower().matchAll(moneyRe)]) {
    let v = toNum(mm[1] || mm[3]) as number;
    if (mm[2] || mm[4]) v *= 1000;
    const idx = mm.index ?? 0;
    const before = lower().slice(Math.max(0, idx - 30), idx);
    const after = lower().slice(idx + mm[0].length, idx + mm[0].length + 30);
    let field: string;
    if (/^\s*(each|per\s+\w+|a\s+(unit|piece|pop|item)|apiece|\/\s*\w+|a\s+\w+)\b/.test(after) || /\b(unit price|price per|each (is|costs?|at)|cost(s)? per|per unit)\s*(of|is|:)?\s*$/.test(before)) field = 'unitPrice';
    else if (/\b(worth|value|valued|declared|total|totalling|totaling|invoice|altogether)\b[^£\d]*$/.test(before) || /^\s*(total|in total|altogether|worth|overall|of (goods|stock|product))/.test(after)) field = 'declaredValue';
    else if (/\b(at|@|priced at|costs?|retail)\s*$/.test(before)) field = 'unitPrice';
    else if (pend?.field === 'unitPrice' || pend?.field === 'declaredValue') field = pend.field;
    else field = v < 200 ? 'unitPrice' : 'declaredValue';
    out.sets.push(field === 'unitPrice' ? { field, value: v, item: 'cur' } : { field, value: v, stated: true });
    consume(mm[0]);
  }

  // ---- weights
  // Unit must end the word: "500 t-shirts" is not 500 tonnes.
  const wRe = /(\d[\d,]*(?:\.\d+)?)\s*(kgs?|kilos?|kilograms?|grams?|g|tonnes?|tons?|t)(?![\w-])/gi;
  for (const mm of [...lower().matchAll(wRe)]) {
    let v = toNum(mm[1]) as number;
    const u = mm[2];
    if (/^g|gram/.test(u) && !/^kg/.test(u)) v = v / 1000;
    else if (/^t/.test(u)) v = v * 1000;
    const idx = mm.index ?? 0;
    const before = lower().slice(Math.max(0, idx - 35), idx);
    const after = lower().slice(idx + mm[0].length, idx + mm[0].length + 25);
    let field: string;
    if (/^\s*(each|per\s+\w+|a\s+(unit|piece|item)|apiece|a piece)\b/.test(after) || /\b(unit weight|weight per unit|each weighs?|weighs? each|each one weighs?)\s*(is|of|:)?\s*$/.test(before)) field = 'unitWeight';
    else if (/\b(gross|total|altogether|overall|shipment|whole|everything|in total|all in)\b/.test(before) || /^\s*(gross|total|in total|altogether|overall|all in)\b/.test(after)) field = 'grossWeight';
    else if (pend?.field === 'unitWeight' || pend?.field === 'grossWeight') field = pend.field;
    else field = v < 20 ? 'unitWeight' : 'grossWeight';
    out.sets.push(field === 'unitWeight' ? { field, value: Math.round(v * 1e6) / 1e6, item: 'cur' } : { field, value: v });
    consume(mm[0]);
  }

  // ---- units per carton
  const upcRes = [
    /(\d[\d,]*)\s*(?:units?|pcs|pieces|items|[a-z-]+s)?\s*(?:per|a|in each|in a|to a|to each|each|\/)\s*(?:carton|box|case|ctn)\b/gi,
    /\b(?:cartons?|boxes|cases)\s*(?:of|hold|holds|holding|contain|contains|containing|with|have|has)\s*(\d[\d,]*)\b(?!\s*(?:kg|g\b|£))/gi,
    /\bpack(?:ed)?\s*(?:in\s*)?(\d[\d,]*)s?\b(?!\s*(?:cartons?|boxes|pallets?))/gi,
    /\b(?:pack size|case size|carton size|units per carton|per carton)\s*(?:is|of|:|=)?\s*(\d[\d,]*)/gi,
  ];
  for (const re of upcRes) for (const mm of [...lower().matchAll(re)]) { out.sets.push({ field: 'upc', value: toNum(mm[1]), item: 'cur' }); consume(mm[0]); }

  // ---- pallets & cartons (absolute)
  for (const mm of [...lower().matchAll(new RegExp(`\\b${NUMW}\\s*(?:x\\s*)?(?:full\\s+|euro\\s+|standard\\s+)?(pallets?|plts?)\\b`, 'gi'))]) {
    out.sets.push({ field: 'pallets', value: toNum(mm[1]), stated: true });
    consume(mm[0]);
  }
  for (const mm of [...lower().matchAll(/\b(\d[\d,]*)\s*(?:x\s*)?(cartons?|boxes|cases|ctns?)\b(\s*(?:in total|total|altogether|overall))?/gi)]) {
    const idx = mm.index ?? 0;
    const before = lower().slice(Math.max(0, idx - 25), idx);
    const totalish = !!mm[3] || /\b(total|in all|altogether)\b/.test(before);
    out.sets.push({ field: 'cartons', value: toNum(mm[1]), cartonScope: totalish ? 'booking' : 'auto' });
    consume(mm[0]);
  }

  // ---- HS code
  for (const mm of [...lower().matchAll(/\b(?:hs|h\.s\.|commodity|tariff|customs)\s*(?:code|no\.?|number|#)?\s*(?:is|:|=|of)?\s*(\d[\d .]{2,14}\d|\d{2,})/gi)]) {
    out.sets.push({ field: 'hs', value: mm[1].replace(/\s/g, ''), item: 'cur' });
    consume(mm[0]);
  }

  // ---- SKU
  for (const mm of [...t.matchAll(/\bsku\s*(?:is|:|=|#|code)?\s*([A-Za-z0-9][\w\-/]{1,30})/gi)]) {
    out.sets.push({ field: 'sku', value: mm[1].toUpperCase(), item: 'cur' });
    consume(mm[0]);
  }

  // ---- country of origin ("made in ...")
  for (const mm of [...lower().matchAll(/\b(?:made|manufactured|produced|sourced|built|assembled|grown)\s+in\s+(?:the\s+)?([a-z .]+?)(?=[,.;)]|\s+(?:and|at|for|with|hs|sku|\d)\b|$)|\b(?:country of origin|origin country|coo)\s*(?:is|:|=)?\s*([a-z .]+?)(?=[,.;)]|\s+(?:and|at|for|with)\b|$)/gi)]) {
    const cap = mm[1] || mm[2];
    const c = findCountry(cap);
    if (!c) continue;
    out.sets.push({ field: 'origin', value: c, item: 'cur' });
    // Consume only up to the country name, so words after it ("... made in Turkey collection from Birmingham") stay available.
    const hit = COUNTRY_ALIASES.map(([re]) => cap.match(re)).find(Boolean);
    const end = hit && hit.index !== undefined ? hit.index + hit[0].length : cap.length;
    consume(mm[0].slice(0, mm[0].length - cap.length + end));
  }

  // ---- cities / countries (route)
  for (const c of UK_CITIES) {
    const re = new RegExp(`\\b${c}\\b`, 'i');
    if (re.test(lower())) { out.sets.push({ field: 'originCity', value: c }); t = t.replace(re, ' '.repeat(c.length)); }
  }
  for (const c of EU_CITIES) {
    const re = new RegExp(`\\b${c}\\b`, 'i');
    if (re.test(lower())) { out.sets.push({ field: 'destCity', value: c }); t = t.replace(re, ' '.repeat(c.length)); }
  }
  if (!out.sets.some(s => s.field === 'destCity'))
    for (const [re, c] of DEST_COUNTRY_RE)
      if (re.test(lower()) && !/made in|manufactured in|origin/.test(L)) { out.sets.push({ field: 'destCountry', value: c }); t = t.replace(re, m0 => ' '.repeat(m0.length)); }

  // ---- destination type
  if (/\b(warehouse|fulfil+ment (centre|center)|fulfil+ment|\bfc\b|distribution (centre|center)|\bdc\b|amazon|3pl|depot|logistics (centre|center|hub)|dark store)\b/i.test(L)) out.sets.push({ field: 'destType', value: 'Warehouse' });
  else if (
    /\b(shop|store|office|business address|boutique|retail(er)?|showroom|salon|restaurant|caf[eé]|premises|business|client'?s?|customer'?s?|stockist|outlet|hotel)\b/i.test(L) &&
    !/business days?/i.test(L) && (pend?.field === 'destType' || /\b(to|deliver(ed|ing)?|going|send|for)\b/i.test(L))
  ) out.sets.push({ field: 'destType', value: 'Business address' });

  // ---- priority
  const pri: Array<[string, RegExp]> = [
    ['Balanced', /\b(balanced?|no (strong )?preference|don'?t (really )?mind|doesn'?t matter|no priority|whatever'?s? best|best value|trade-?off|middle|mix of|happy with any|either is fine|not fussed)\b/i],
    ['Most reliable', /\b(reliab\w*|on[- ]time|dependable|safest|safe option|punctual|must arrive on|can'?t be late|cannot be late|guarantee\w*|consisten\w*|trustworthy)\b/i],
    ['Fastest', /\b(fast\w*|quick\w*|asap|a\.s\.a\.p|urgent\w*|express(?! road)|speed\w*|soonest|as soon as possible|rush\w*|hurry|time[- ]critical)\b/i],
    ['Cheapest', /\b(cheap\w*|lowest (cost|price)|low[- ]cost|budget|save money|cost[- ]effective|economy|economical|inexpensive|least expensive|minimi[sz]e cost|keep costs? down|cost is (key|important|priority))\b/i],
  ];
  for (const [p, re] of pri) if (re.test(L)) { out.sets.push({ field: 'priority', value: p }); break; }

  // ---- appointment
  if (
    /\b((delivery )?(slot|appointment|booking slot) (is |has been |already )?(booked|confirmed|arranged|sorted)|(have|got|booked|has|made|arranged)( a| an| the| our)? (delivery )?(slot|appointment))\b/i.test(L) &&
    !/\b(no|not|haven'?t|don'?t|without|yet to)\b[^.]{0,25}\b(slot|appointment)/i.test(L)
  ) out.sets.push({ field: 'appointment', value: 'Yes' });
  else if (/\b(no|not|haven'?t|don'?t have|without|yet to book|not yet)\b[^.]{0,25}\b(slot|appointment)|\b(slot|appointment)\b[^.]{0,20}\b(not (yet )?booked|not arranged|pending)\b/i.test(L))
    out.sets.push({ field: 'appointment', value: 'No' });

  // ---- seller name
  const sellerPats = [
    /\b(?:we are|we're|this is|i'?m from|i am from|i work (?:at|for)|company(?: name)? is|seller(?: name)? is|business(?: name)? is|on behalf of|our company is|my company is|the seller is|i run|we run|from the company)\s+([A-Za-z0-9][\w&'.\- ]{1,40}?)(?=\s*[,.;!]|\s+(?:and|we|i|in|based|located|sending|shipping|need|want|would|have|ltd\b(?!\w))\b|$)/i,
    /\b([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*){0,3}\s+(?:Ltd|Limited|LLP|PLC|Co|Goods|Trading|Supplies|Imports|Exports|Homewares|Retail|Designs|Crafts|Studio|Store|Textiles|Ceramics|Candles|Outdoor|Beauty|Tech|Foods|Tea))\b\.?/,
    // "please book the following for Pennine Textiles:" (an order email)
    /\b(?:following|booking|shipment|order|consignment)\s+for\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3})(?=\s*[,.;:!]|\s*$|\s+(?:from|to|please|ready)\b)/,
  ];
  for (const re of sellerPats) {
    const mm = orig.match(re);
    if (!mm) continue;
    const name = mm[1].trim();
    if (!UK_CITIES.concat(EU_CITIES).some(c => c.toLowerCase() === name.toLowerCase()) && !/^(a|an|the|sending|shipping|looking|trying)\b/i.test(name) && name.length > 1) {
      out.sets.push({ field: 'seller', value: name });
      consume(mm[0].trim());
      break;
    }
  }

  // ---- products: "<qty> <product>"
  const STOP = /^(pallets?|plts?|cartons?|boxes|box|cases?|ctns?|kgs?|kilos?|g|grams?|days?|weeks?|units? per|per|gbp|pounds?|%|percent|tonnes?|t|of|am|pm|x|to|and|or|more|less|fewer|extra|digits?|hs|st|nd|rd|th|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|hours?|mins?|minutes?|in|on|at|a|the)$/i;
  const itemRe = /(?:^|[\s,;(])(\d[\d,]*)\s*(?:x\s+|units?\s+of\s+|pcs\s+of\s+|pieces\s+of\s+|packs?\s+of\s+)?([a-z][a-z0-9\-'/]*(?:\s+[a-z0-9][a-z0-9\-'/]*){0,5}?)(?=\s*(?:[,.;:)(]|\bat\b|@|\bfor\b|\beach\b|\bpriced\b|\bcosting\b|\bwhich\b|\bthat\b|\bweigh\w*\b|\bmade\b|\bhs\b|\bpacked\b|\bpack\b|\bin\b|\bwith\b|\band\b|\bfrom\b|\bto\b|\bon\b|\bsku\b|\bworth\b|\bvalued\b|$))/gi;
  for (const mm of [...lower().matchAll(itemRe)]) {
    const q = toNum(mm[1]);
    const noun = mm[2].trim();
    if (STOP.test(noun.split(/\s+/)[0]) || q === null) continue;
    if (/^(units?|pcs|pieces|items|products?|skus?|of them)$/.test(noun)) { out.sets.push({ field: 'qty', value: q, item: 'cur' }); consume(mm[0].trim()); continue; }
    out.items.push({ qty: q, description: richer(tidyDesc(noun, orig), orig) });
    consume(mm[0].trim());
  }
  // "ship some scented candles and cotton t-shirts": products named without counts
  if (!out.items.length && !(pend?.field && pend.field !== 'description')) {
    const ms = orig.match(/\b(?:ship|shipping|send|sending|moving|move|export|exporting|dispatch|deliver|delivering)\s+(?:out\s+)?(?:some|a few|a load of|a batch of|our|my|the|a shipment of|a consignment of)?\s*([A-Za-z][A-Za-z0-9\-' ,&]+?)(?=\s+(?:to|from|for|on|by|next|this|in|via|at|which|that)\b|[.;!?]|$)/i);
    if (ms) {
      const parts = ms[1].split(/\s*(?:,|\band\b|&)\s*/).map(x => x.trim()).filter(x =>
        x && !/^(pallets?|cartons?|boxes|goods|stock|products?|items?|stuff|things|it|them|some|shipment|a shipment|an order|order)$/i.test(x) &&
        !STOP.test(x.split(/\s+/)[0]) && x.split(/\s+/).length <= 5 && !/\d/.test(x));
      parts.forEach(x => out.items.push({ qty: null, description: x.replace(/^\w/, c => c.toUpperCase()) }));
    }
  }
  // "3 pallets of ceramic coffee mugs": a product named without a unit count
  if (!out.items.length) {
    const mo = orig.match(/\b(?:pallets?|cartons?|boxes|cases|load|shipment|lots?|batch|consignment)\s+of\s+([A-Za-z][A-Za-z0-9\- ]{2,40}?)(?=\s*[,.;!]|\s+(?:from|to|at|for|and|in|which|that|going|heading|bound)\b|$)/i);
    if (mo && !STOP.test(mo[1].split(/\s+/)[0]) && !/^(goods|stock|products?|items?|stuff|things)$/i.test(mo[1].trim()))
      out.items.push({ qty: null, description: mo[1].trim().replace(/^\w/, c => c.toUpperCase()) });
  }

  // ---- an answer to the pending question that nothing above captured
  const got = (f: string) => out.sets.some(s => s.field === f) || (f === 'description' && out.items.length > 0);
  if (pend?.field && !got(pend.field) && !out.sets.length && !out.items.length && out.removeItem === undefined) {
    const pv = interpretPending(pend.field, orig);
    if (pv !== undefined) {
      const s: FieldSet = { field: pend.field, value: pv, fromPending: true };
      if (isItemKey(pend.field)) s.item = pend.item ?? 'cur';
      if (pend.field === 'cartons') s.cartonScope = 'auto';
      if (pend.field === 'pallets' || pend.field === 'declaredValue') s.stated = true;
      out.sets.push(s);
    }
  }
  return out;
}

/** Prefer a fuller description mentioned elsewhere ("pallets of ceramic coffee mugs" + "1080 mugs"). */
function richer(desc: string, orig: string): string {
  const last = singular(desc.toLowerCase().split(/\s+/).pop() || '');
  const re = /\b(?:pallets?|cartons?|boxes|cases|load|shipment|lots?|batch|consignment)\s+of\s+([A-Za-z][A-Za-z0-9\- ]{2,40}?)(?=\s*[,.;!]|\s+(?:from|to|at|for|and|in|which|that|going)\b|$)/gi;
  for (const m of orig.matchAll(re)) {
    const cand = m[1].trim();
    const cl = singular(cand.toLowerCase().split(/\s+/).pop() || '');
    if (cl === last && cand.length > desc.length) return cand.replace(/^\w/, c => c.toUpperCase());
  }
  return desc;
}

function tidyDesc(noun: string, orig: string): string {
  const i = orig.toLowerCase().indexOf(noun.toLowerCase());
  let d = i >= 0 ? orig.substr(i, noun.length) : noun; // recover the original casing
  d = d.replace(/^(of|units of)\s+/i, '').trim();
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** Read a short reply ("620", "UK", "not yet") as the answer to the question we just asked. */
export function interpretPending(field: string, orig: string): string | number | undefined {
  const s = orig.trim().replace(/[.!]+$/, '');
  const L = s.toLowerCase();
  const unknown = /^(i )?(don'?t know|dunno|not sure|no idea|unknown|skip|n\/a|none|leave (it )?blank|not known|no clue|pass)\b/i.test(L);
  const firstNum = () => {
    const m = L.match(/(-?\d[\d,]*(?:\.\d+)?)|\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen)\b/);
    return m ? toNum(m[1] || m[2]) : null;
  };
  switch (field) {
    case 'seller': {
      if (unknown) return undefined;
      const n = s.replace(/^(it'?s|it is|we are|we'?re|i'?m|i am|the company is|company name is|company is|seller is|name is|this is|called|we'?re called|my company is|our company is)\s+/i, '').trim();
      return n.length >= 2 && n.length <= 60 ? n : undefined;
    }
    case 'description': {
      if (unknown || s.length < 2 || !/[a-z]{3}/i.test(s)) return undefined;
      return s.replace(/^(they are|they'?re|it'?s|it is|we'?re sending|sending|some|we have)\s+/i, '').replace(/^\w/, c => c.toUpperCase());
    }
    case 'hs': {
      if (unknown) return '';
      const m = L.match(/\d[\d .]{2,14}\d|\d{2,}/);
      return m ? m[0].replace(/\s/g, '') : undefined;
    }
    case 'origin': {
      if (unknown) return '';
      return findCountry(L) || undefined;
    }
    case 'appointment': {
      if (/^(y|yes|yeah|yep|yup|sure|correct|done|booked|we have|i have|already|it is|affirmative)\b/i.test(L)) return 'Yes';
      if (/^(n|no|nope|not yet|nah|none|haven'?t|have not|don'?t|do not|not booked)\b/i.test(L)) return 'No';
      return undefined;
    }
    case 'destType': {
      if (/ware|fulfil|amazon|fc|distribution|depot/i.test(L)) return 'Warehouse';
      if (/business|shop|store|office|address|retail|customer|client/i.test(L)) return 'Business address';
      return undefined;
    }
    case 'priority': {
      if (/cheap|cost|budget|price|econom/i.test(L)) return 'Cheapest';
      if (/fast|quick|speed|asap|urgent|express/i.test(L)) return 'Fastest';
      if (/reliab|on.?time|safe|depend/i.test(L)) return 'Most reliable';
      if (/balanc|any|mind|whatever|best|either|both|no pref/i.test(L)) return 'Balanced';
      return undefined;
    }
    case 'originCity': return UK_CITIES.find(x => L.includes(x.toLowerCase()));
    case 'destCity': return EU_CITIES.find(x => L.includes(x.toLowerCase()));
    case 'readyDate': {
      const d = parseDateText(L, today());
      return d ? fmtDate(d.date) : undefined;
    }
    case 'pallets': case 'qty': case 'upc': case 'cartons': case 'unitPrice': case 'declaredValue': case 'grossWeight': case 'unitWeight': {
      let n = firstNum();
      if (n === null) return undefined;
      if (/\d\s*(g|grams?)\b/.test(L) && !/kg/.test(L) && field === 'unitWeight') n = n / 1000;
      if (/\d\s*(t|tonnes?|tons?)\b/.test(L) && field === 'grossWeight') n = n * 1000;
      return n;
    }
  }
  return undefined;
}

/** Map "<lhs> to <rhs>" (e.g. "HS code for MUG-01" → "691200") into field updates. */
function resolveFieldEdit(lhs: string, rhs: string, ctx: UnderstandContext): FieldSet[] | null {
  const l = lhs.toLowerCase(), r = rhs.trim().replace(/[.!]+$/, '');
  const itemIdx = resolveItem(l + ' ' + r, ctx.items);
  const itemRef: ItemRef = itemIdx !== null ? itemIdx : 'cur';
  const N = () => {
    const m = r.toLowerCase().match(/(\d[\d,]*(?:\.\d+)?)|\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
    return m ? toNum(m[1] || m[2]) : null;
  };
  const withNum = (f: (n: number) => number) => { const n = N(); return n === null ? null : f(n); };
  const map: Array<[RegExp, () => FieldSet | null]> = [
    [/declared|total value|^value|invoice value|worth/, () => ({ field: 'declaredValue', value: N(), stated: true })],
    [/unit weight|weight per|weight each|each weigh/, () => ({ field: 'unitWeight', value: /\d\s*g\b/.test(r) && !/kg/i.test(r) ? withNum(n => n / 1000) : N(), item: itemRef })],
    [/gross|total weight|^weight|shipment weight/, () => ({ field: 'grossWeight', value: /\d\s*t(onnes?)?\b/i.test(r) ? withNum(n => n * 1000) : N() })],
    [/units? per (carton|box)|per carton|pack size|case size/, () => ({ field: 'upc', value: N(), item: itemRef })],
    [/pallet/, () => ({ field: 'pallets', value: N(), stated: true })],
    [/carton|boxes/, () => (itemIdx !== null && !/total/.test(l)
      ? { field: 'cartons', value: N(), item: itemIdx, cartonScope: 'item' }
      : { field: 'cartons', value: N(), cartonScope: (ctx.items || []).length > 1 || /total|booking/.test(l) ? 'booking' : 'auto' })],
    [/quantity|qty|^units?$|number of units|amount of/, () => ({ field: 'qty', value: N(), item: itemRef })],
    [/unit price|price|cost each|cost per/, () => ({ field: 'unitPrice', value: N(), item: itemRef })],
    [/\bhs\b|commodity|tariff|customs code/, () => ({ field: 'hs', value: (r.match(/\d[\d .]*\d|\d/) || [''])[0].replace(/\s/g, ''), item: itemRef })],
    [/country of origin|origin country|made in|^origin$|coo/, () => {
      const city = UK_CITIES.find(x => r.toLowerCase().includes(x.toLowerCase()));
      if (city) return { field: 'originCity', value: city };
      const c = findCountry(r);
      return c ? { field: 'origin', value: c, item: itemRef } : null;
    }],
    [/origin city|collect(ion)? (city|from)|pick ?up (city|from)|^from$|ship(ping)? from/, () => {
      const city = UK_CITIES.find(x => r.toLowerCase().includes(x.toLowerCase()));
      return city ? { field: 'originCity', value: city } : null;
    }],
    [/ready|ship date|collection date|pick ?up date|^date$|dispatch/, () => {
      const d = parseDateText(r, today());
      return d ? { field: 'readyDate', value: fmtDate(d.date), rel: d.rel ? d.span : null } : null;
    }],
    [/priority|preference/, () => { const v = interpretPending('priority', r); return v ? { field: 'priority', value: v } : null; }],
    [/destination type|delivery type|site type|type of (site|destination)/, () => { const v = interpretPending('destType', r); return v ? { field: 'destType', value: v } : null; }],
    [/destination country|dest(ination)? country|^country$/, () => { const c = DEST_COUNTRY_RE.find(([re]) => re.test(r)); return c ? { field: 'destCountry', value: c[1] } : null; }],
    [/destination|dest city|deliver(y)? (city|to)|^city$|^to$|going to|send(ing)? to/, () => {
      const city = EU_CITIES.find(x => r.toLowerCase().includes(x.toLowerCase()));
      if (city) return { field: 'destCity', value: city };
      const c = DEST_COUNTRY_RE.find(([re]) => re.test(r));
      return c ? { field: 'destCountry', value: c[1] } : null;
    }],
    [/seller|company|business name|shipper/, () => ({ field: 'seller', value: r })],
    [/appointment|slot/, () => {
      const v = /^(y|yes|booked|done|true)/i.test(r) ? 'Yes' : /^(n|no|not|false)/i.test(r) ? 'No' : null;
      return v ? { field: 'appointment', value: v } : null;
    }],
    [/description|product name|item name/, () => ({ field: 'description', value: r, item: itemRef })],
    [/\bsku\b|product code/, () => ({ field: 'sku', value: r.toUpperCase(), item: itemRef })],
    [/carrier/, () => { const m = r.match(/\b([abc])\b/i); return m ? { field: 'carrier', value: 'Carrier ' + m[1].toUpperCase() } : null; }],
    [/currency/, () => ({ field: 'currency', value: r.toUpperCase().slice(0, 3) })],
  ];
  // Strip item references from the left-hand side before matching field names.
  let lhsField = l;
  (ctx.items || []).forEach(it => { if (it.sku) lhsField = lhsField.replace(it.sku.toLowerCase(), ' '); });
  lhsField = lhsField.replace(/\b(for|of|on)\b.*$/, '').trim() || l;
  for (const [re, fn] of map) {
    if (re.test(lhsField) || re.test(l)) {
      const v = fn();
      if (!v || v.value === null || v.value === undefined || (typeof v.value === 'number' && Number.isNaN(v.value))) return null;
      return [v];
    }
  }
  return null;
}
