/* Sanity limits for numbers that are valid but implausible, e.g. a t-shirt "weighing" 100 kg because grams were typed as kg. */
import { hsDigits } from './hs';
import type { Item } from './types';

/** Heaviest believable single unit (kg) by HS chapter (first two digits), with keyword fallbacks. */
const CHAPTER_MAX_KG: Record<string, number> = {
  '09': 30, // tea, coffee
  '18': 30, '19': 30, // chocolate, biscuits
  '33': 5, '34': 10, // cosmetics, soap and candles
  '42': 10, // bags
  '48': 10, '49': 10, // paper, books
  '61': 3, '62': 3, '63': 15, // clothing, textiles
  '64': 4, // footwear
  '69': 30, '70': 30, // ceramics, glass
  '71': 2, // jewellery
  '82': 10, // cutlery
  '85': 60, // electrical
  '90': 5, '91': 3, // optical, watches
  '95': 40, // toys and sports
};
const KEYWORD_MAX_KG: Array<[RegExp, number]> = [
  [/t-?shirt|shirt|tee\b|sock|scarf|glove|hat\b|cap\b|hoodie|sweater|jumper|dress|towel|pillowcase|cushion cover/i, 3],
  [/mug|cup|plate|bowl|glass/i, 5],
  [/candle|soap|tea\b|coffee|chocolate|cable|charger|phone case|book|notebook/i, 10],
];
/** Above this, a carton cannot be handled by one person (the usual guidance is 23–25 kg). */
export const MAX_CARTON_KG = 40;

export function maxUnitKg(it: Pick<Item, 'hs' | 'description'>): number | null {
  const ch = hsDigits(it.hs).slice(0, 2);
  if (ch.length === 2 && CHAPTER_MAX_KG[ch] !== undefined) return CHAPTER_MAX_KG[ch];
  for (const [re, kg] of KEYWORD_MAX_KG) if (re.test(it.description || '')) return kg;
  return null;
}

/** If the unit weight looks like grams entered as kilograms, the corrected kg value; otherwise null. */
export function gramsAsKg(it: Pick<Item, 'hs' | 'description' | 'unitWeight'>): number | null {
  const cap = maxUnitKg(it);
  if (it.unitWeight === null || cap === null || it.unitWeight <= cap) return null;
  const g = Math.round((it.unitWeight / 1000) * 1e6) / 1e6;
  return g > 0 && g <= cap ? g : null;
}
