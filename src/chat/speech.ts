/* Spoken → written: turns a speech-recognition transcript into the kind of text people type, so dictated bookings
   go through the same parser as typed ones. Handles number words ("one thousand and eighty" → 1080), dictated
   digit strings ("six nine one two zero zero" → 691200), money ("five pounds fifty" → £5.50), grams, ordinals
   ("twelfth of November" → 12th of November), spoken punctuation, and city names speech engines often mishear. */
import { ALLOWED, CITY_TO_COUNTRY } from '../domain/reference';

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, nought: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1e6 };
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18,
  nineteenth: 19, twentieth: 20, thirtieth: 30,
};
const suffix = (n: number): string => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

const DIGIT_WORDS: Record<string, number> = { zero: 0, nought: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const NUM_WORD = `(?:${[...Object.keys(UNITS).filter(w => w !== 'oh'), ...Object.keys(TENS), ...Object.keys(SCALES)].join('|')}|\\d+)`;
const DIGIT_WORD = `(?:${Object.keys(DIGIT_WORDS).join('|')}|\\d)`;
/** A run of number words ("one thousand and eighty", "twenty-four", "a hundred"), optionally with spoken decimals ("point five"). */
const RUN = new RegExp(`\\b(?:an?\\s+(?=hundred|thousand|million))?${NUM_WORD}(?:(?:[\\s-]+and)?[\\s-]+${NUM_WORD})*(?:\\s+point(?:\\s+${DIGIT_WORD})+)?\\b`, 'gi');
/** Three or more digits said one at a time ("six nine one two zero zero"), as for an HS code. */
const DICTATED = new RegExp(`\\b${DIGIT_WORD}(?:[\\s-]+${DIGIT_WORD}){2,}\\b`, 'gi');
const ORDINAL = new RegExp(`\\b(?:(${Object.keys(TENS).join('|')})[\\s-]+)?(${Object.keys(ORDINALS).join('|')})\\b`, 'gi');

/** Value of a run of number words, e.g. "one thousand and eighty" → 1080. Digits may be mixed in ("1 thousand"). */
function runValue(words: string[]): number {
  let total = 0, cur = 0;
  for (const w of words) {
    if (w === 'and') continue;
    if (w === 'a' || w === 'an') cur = 1;
    else if (/^\d+$/.test(w)) cur += +w;
    else if (w in UNITS) cur += UNITS[w];
    else if (w in TENS) cur += TENS[w];
    else if (w === 'hundred') cur = (cur || 1) * 100;
    else if (w in SCALES) { total += (cur || 1) * SCALES[w]; cur = 0; }
  }
  return total + cur;
}

function numbersToDigits(text: string): string {
  let t = text.replace(DICTATED, m => {
    const ws = m.toLowerCase().split(/[\s-]+/);
    // a dictated code only when it is really digit-by-digit (not "one two hundred"); keep a lone "one" pronoun intact
    return ws.map(w => (/^\d$/.test(w) ? w : String(DIGIT_WORDS[w]))).join('');
  });
  t = t.replace(ORDINAL, (_, tens: string | undefined, ord: string) => {
    const n = (tens ? TENS[tens.toLowerCase()] : 0) + ORDINALS[ord.toLowerCase()];
    return n + suffix(n);
  });
  t = t.replace(RUN, m => {
    const [whole, dec] = m.split(/\s+point\s+/i);
    const words = whole.toLowerCase().split(/[\s-]+/);
    if (/^\d+$/.test(whole.trim()) && !dec) return m; // already digits
    if (words.length === 1 && words[0] === 'one' && !dec) return m; // "the only one", "one more"
    const value = runValue(words);
    const decimals = dec ? '.' + dec.toLowerCase().split(/\s+/).map(d => (/^\d$/.test(d) ? d : String(DIGIT_WORDS[d]))).join('') : '';
    return String(value) + decimals;
  });
  return t;
}

/** Words speech engines commonly produce for the cities Garuda serves. */
const CITY_FIXES: Array<[RegExp, string]> = [
  [/\b(from|in|to|at|near)\s+(leads|lead's|leeds')\b/gi, '$1 Leeds'],
  [/\b(lyons?|lions?|leon|lee on)\b/gi, 'Lyon'],
  [/\bhamburger\b/gi, 'Hamburg'],
  [/\b(frank\s?fort|frankfort|frank furt)\b/gi, 'Frankfurt'],
  [/\brotter\s?dam\b/gi, 'Rotterdam'],
  [/\bamster\s?dam\b/gi, 'Amsterdam'],
  [/\bbirming\s?ham\b/gi, 'Birmingham'],
  [/\bmanchest(?:er)?\b/gi, 'Manchester'],
];
const CITIES = [...ALLOWED.originCity, ...Object.keys(CITY_TO_COUNTRY)];
/** "we're <name>" / "this is <name>" up to the first word that starts the booking itself. */
const NAME_END = String.raw`(?=\s+(?:\d|here\b|and\b|we\b|i\b|need|want|would|shipping|sending|have|got|please|to\b|from\b|a\b|an\b|some\b))(?:\s+here\b)?`;
const NAME = String.raw`((?:[a-z][\w&'.-]*\s+){0,4}?[a-z][\w&'.-]*)`;
/** "this is <name>" / "it's <name>" only at the start; "we're <name>" / "I'm from <name>" anywhere. */
const INTRO_START = new RegExp(String.raw`^\s*(?:(?:hi|hello|hey)[,\s]+)?(this is|it's)\s+` + NAME + NAME_END, 'i');
const INTRO_ANY = new RegExp(String.raw`\b(we're|we are|i'm from|i am from|i'm calling from)\s+` + NAME + NAME_END, 'i');

export function normalizeSpeech(raw: string): string {
  let t = ` ${raw.trim()} `;
  // spoken punctuation
  t = t.replace(/\s+(comma)\b/gi, ',').replace(/\s+(full stop|period)\b/gi, '.').replace(/\s+new (line|paragraph)\b/gi, '.');
  t = t.replace(/\bper ?cent\b/gi, '%').replace(/\bh\.?\s?s\.?(?:\s?n\.?)?\s+code\b/gi, 'HS code').replace(/\bhsn\b/gi, 'HS code');
  t = t.replace(/\bhalf an?\s+(kilo|kilogram|kg)s?\b/gi, '0.5 kg');
  // years said in pairs: "twenty twenty six" → 2026
  t = t.replace(new RegExp(`\\btwenty[\\s-]+(twenty|thirty)(?:[\\s-]+(${Object.keys(UNITS).filter(w => UNITS[w] > 0 && UNITS[w] < 10).join('|')}))?\\b`, 'gi'),
    (_, tens: string, unit: string | undefined) => String(2000 + TENS[tens.toLowerCase()] + (unit ? UNITS[unit.toLowerCase()] : 0)));
  t = numbersToDigits(t);
  // a spoken introduction has no full stop: "we're northfield goods 3 pallets…" → "We're Northfield Goods. 3 pallets…"
  const intro = (_: string, lead: string, name: string) => `${lead} ${name.replace(/\b[a-z]/g, c => c.toUpperCase())}.`;
  t = INTRO_START.test(t) ? t.replace(INTRO_START, intro) : t.replace(INTRO_ANY, intro);
  // money: "5 pounds 50", "5 pounds and 50 pence", "50 pence", "£5 50"
  t = t.replace(/\b(\d+)\s*(?:pounds?|quid|gbp)\s+(?:and\s+)?(\d{1,2})(?:\s*(?:pence|p))?\b/gi, (_, a, b) => `£${a}.${b.padStart(2, '0')}`);
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*(?:pounds?|quid|gbp)\b/gi, '£$1');
  t = t.replace(/\b(\d{1,2})\s*(?:pence|p)\b(?!\w)/gi, (_, p) => `£0.${p.padStart(2, '0')}`);
  t = t.replace(/£(\d+)\s+(\d{2})\b(?!\s*(?:kg|kilos?|units?|per|pallets?|cartons?|boxes|mugs|pieces))/gi, '£$1.$2');
  // weights
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*(?:kilograms?|kilos?|kgs?|kilo)\b/gi, '$1 kg');
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*grams?\b/gi, (_, g) => `${+(+g / 1000).toFixed(3)} kg`);
  // city names
  for (const [re, to] of CITY_FIXES) t = t.replace(re, to);
  for (const c of CITIES) t = t.replace(new RegExp(`\\b${c}\\b`, 'gi'), c);
  t = t.replace(/\s+([,.%])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Pick the recognition alternative that reads most like a booking (cities, numbers, freight words). */
export function bestAlternative(alts: string[]): string {
  const score = (s: string) => {
    const n = normalizeSpeech(s);
    let k = 0;
    for (const c of CITIES) if (n.includes(c)) k += 3;
    k += (n.match(/\d/g) || []).length > 0 ? 2 : 0;
    k += (n.match(/\b(pallets?|cartons?|units?|each|per|kg|£|warehouse|ready|cheapest|fastest|reliable|balanced|hs code|made in)\b/gi) || []).length;
    return k;
  };
  return alts.reduce((best, a) => (score(a) > score(best) ? a : best), alts[0] ?? '');
}

/** Lower-case length of the shared start of two strings. */
const sharedStart = (a: string, b: string) => {
  const x = a.toLowerCase(), y = b.toLowerCase();
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i;
};

/** Join recognised segments into one transcript. Some browsers (Chrome on Android, some macOS builds) report each
    revision of the same phrase as a new final result ("check h", "can you check hatches", "can you check HSN code");
    a segment that revises or repeats the previous one replaces it instead of being appended. */
export function mergeSegments(segments: string[]): string {
  const out: string[] = [];
  for (const raw of segments) {
    const s = raw.trim();
    if (!s) continue;
    const last = out[out.length - 1];
    if (last !== undefined) {
      const l = last.toLowerCase(), n = s.toLowerCase();
      if (n.includes(l) || sharedStart(l, n) >= Math.min(l.length, n.length) * 0.5) { out[out.length - 1] = s; continue; }
      if (l.includes(n)) continue;
    }
    out.push(s);
  }
  return out.join(' ');
}
