/* Turn loose input (sheet cells, typed text) into a clean Booking. Idempotent. */
import { ALLOWED, CITY_TO_COUNTRY } from './reference';
import { blank, num, pickCase } from './format';
import { fmtDate, parseDate } from './dates';
import { normHS } from './hs';
import type { Booking, Item, RawBooking, RawItem } from './types';

const str = (v: unknown): string => (blank(v) ? '' : String(v).trim());

export function normalizeItem(raw: RawItem): Item {
  const it: Item = {
    sku: str(raw.sku),
    description: str(raw.description),
    hs: normHS(raw.hs),
    qty: num(raw.qty),
    unitPrice: num(raw.unitPrice),
    upc: num(raw.upc),
    cartons: num(raw.cartons),
    unitWeight: num(raw.unitWeight),
    origin: pickCase(str(raw.origin), ALLOWED.itemOrigin),
  };
  if (!blank(raw.bookingId)) it.bookingId = str(raw.bookingId);
  if (typeof raw._row === 'number') it._row = raw._row;
  return it;
}

export function normalizeBooking(raw: RawBooking): Booking {
  let readyDate: string;
  if (raw.readyDate instanceof Date || typeof raw.readyDate === 'number') {
    const d = parseDate(raw.readyDate);
    readyDate = d ? fmtDate(d) : String(raw.readyDate);
  } else readyDate = str(raw.readyDate);
  const currency = str(raw.currency);
  const b: Booking = {
    id: str(raw.id),
    seller: str(raw.seller),
    originCity: pickCase(str(raw.originCity), ALLOWED.originCity),
    originCountry: pickCase(str(raw.originCountry), ALLOWED.originCountry),
    destCity: pickCase(str(raw.destCity), Object.keys(CITY_TO_COUNTRY)),
    destCountry: pickCase(str(raw.destCountry), ALLOWED.destCountry),
    destType: pickCase(str(raw.destType), ALLOWED.destType),
    readyDate,
    priority: pickCase(str(raw.priority), ALLOWED.priority),
    pallets: num(raw.pallets),
    cartons: num(raw.cartons),
    declaredValue: num(raw.declaredValue),
    currency: currency ? currency.toUpperCase() : '',
    grossWeight: num(raw.grossWeight),
    appointment: pickCase(str(raw.appointment), ALLOWED.yesNo),
    items: (raw.items || []).map(normalizeItem),
  };
  if (typeof raw._row === 'number') b._row = raw._row;
  return b;
}

export const cloneBooking = (b: Booking): Booking => ({ ...b, items: b.items.map(it => ({ ...it })) });
