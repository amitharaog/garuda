/* Confirmation: headline, shipping-label fields, "what happens next" steps, invoice rows and the booking reference. */
import { COUNTRY_CODE } from './reference';
import { fmtNum, kg, money, plural, round2, uniq } from './format';
import { niceDate, nextWorkingDay, parseDate } from './dates';
import type { Booking, CheckResult } from './types';

export interface Confirmation {
  headline: string;
  route: string;
  goods: string;
  carrier: string;
  timing: string;
  next: string[];
}

export function confirmation(r: CheckResult): Confirmation {
  const b = r.booking, ch = r.rec.chosen, rd = parseDate(b.readyDate);
  const route = `${b.originCity || '?'}, ${b.originCountry || '?'} → ${b.destCity || '?'}, ${b.destCountry || '?'}${b.destType ? ' (' + b.destType.toLowerCase() + ')' : ''}`;
  const goods = `${plural(b.items.length, 'product line')}, ${fmtNum(r.totals.units)} units in ${plural(b.cartons ?? r.totals.sumCartons ?? 0, 'carton')} on ${plural(b.pallets ?? 0, 'pallet')}, ${kg(b.grossWeight)} gross, declared value ${money(b.declaredValue)}`;
  const carrier = ch
    ? `${ch.key}: ${money(ch.cost)} total (${money(ch.c.price)} × ${plural(b.pallets ?? 0, 'pallet')}), ${ch.c.transit} days in transit, ${ch.c.ontime}% on time`
    : 'No carrier available';
  const timing = rd ? `Ready ${niceDate(rd)} → estimated delivery ${niceDate(r.eta)}` : 'Ready date not set';
  const who = `Booking ${b.id || ''} for ${b.seller || 'you'}`;
  let headline: string;
  if (r.status === 'Red') headline = `${who} is ON HOLD. It has ${plural(r.red, 'issue')} that would stop it at collection, customs or the warehouse. Nothing has been booked yet.`;
  else if (r.status === 'Amber') headline = `${who} can go ahead, but ${plural(r.amber, 'warning')} should be fixed or checked first to avoid delays.`;
  else headline = `${who} passed all 10 pre-flight checks and is ready to book.`;
  return { headline, route, goods, carrier, timing, next: nextSteps(r) };
}

export function nextSteps(r: CheckResult): string[] {
  const b = r.booking, ch = r.rec.chosen, rd = parseDate(b.readyDate);
  const steps: string[] = [];
  const reds = r.issues.filter(i => i.severity === 'Red'), ambers = r.issues.filter(i => i.severity === 'Amber');
  const ids = (xs: typeof reds) => uniq(xs.map(i => i.rule)).join(', ');
  if (reds.length) {
    steps.push(`Fix the ${plural(reds.length, 'red issue')} (${ids(reds)}). The booking stays on hold until they are fixed.`);
    if (ambers.length) steps.push(`Also check the ${plural(ambers.length, 'amber warning')} (${ids(ambers)}).`);
    steps.push('Once you change anything, all checks run again automatically. When it turns green or amber, confirm and we book the carrier.');
    return steps;
  }
  if (ambers.length) steps.push(`Recommended: fix the ${plural(ambers.length, 'amber warning')} (${ids(ambers)}), or confirm that you accept the risk.`);
  if (ch) steps.push(`We reserve ${ch.key} to collect from ${b.originCity || 'your site'} on ${rd ? niceDate(nextWorkingDay(rd)) : 'your ready date'}. Cost: ${money(ch.cost)}.`);
  steps.push(`We create the commercial invoice from your ${plural(b.items.length, 'item line')} (HS code, country of origin, quantity, value: ${money(b.declaredValue)} total). It travels with the goods for UK export and ${b.destCountry || 'EU'} import customs.`);
  steps.push(`Print and stick ${plural(b.cartons ?? r.totals.sumCartons ?? 0, 'carton label')} and ${plural(b.pallets ?? 0, 'pallet label')}, one per carton and pallet, so the warehouse count matches what you declared.`);
  if (b.destType === 'Warehouse')
    steps.push(b.appointment === 'Yes' ? `Your warehouse delivery slot is booked; make sure it is on or after ${niceDate(r.eta)}.` : `Book a delivery slot at the warehouse for ${niceDate(r.eta)} or later.`);
  steps.push(`You get a tracking reference when the goods are collected. Estimated delivery to ${b.destCity || 'destination'}: ${niceDate(r.eta)} (${ch ? ch.c.transit : '?'} days in transit, ${ch ? ch.c.ontime : '?'}% on time).`);
  return steps;
}

export interface LabelField {
  k: string;
  v: string[];
}

/** The shipping-label card: reference, from/to, carrier, cost, collection, ETA, counts, weight and value. */
export function labelFields(r: CheckResult): LabelField[] {
  const b = r.booking, ch = r.rec.chosen, rd = parseDate(b.readyDate);
  return [
    { k: 'From', v: [b.seller || '—', `${b.originCity}, ${b.originCountry}`] },
    { k: 'To', v: [b.destType || '', `${b.destCity}, ${b.destCountry}`] },
    { k: 'Carrier', v: [ch ? ch.key : '—'] },
    { k: 'Freight cost', v: [ch ? `${money(ch.cost)} (${money(ch.c.price)} × ${fmtNum(b.pallets)})` : '—'] },
    { k: 'Collection', v: [rd ? niceDate(nextWorkingDay(rd)) : '—'] },
    { k: 'Est. delivery', v: [r.eta && ch ? `${niceDate(r.eta)} · ${ch.c.ontime}% on time` : '—'] },
    { k: 'Pallets / cartons', v: [`${fmtNum(b.pallets)} / ${fmtNum(b.cartons)} · ${fmtNum(r.totals.units)} units`] },
    { k: 'Gross weight / value', v: [`${kg(b.grossWeight)} · ${money(b.declaredValue)}`] },
  ];
}

export const countryCode = (country: string): string => COUNTRY_CODE[country] || '??';

export interface InvoiceRow {
  sku: string;
  description: string;
  hs: string;
  origin: string;
  qty: number | null;
  unitPrice: number | null;
  total: number | null;
  weight: number | null;
}

export function invoiceRows(b: Booking): InvoiceRow[] {
  return b.items.map(it => ({
    sku: it.sku, description: it.description, hs: it.hs, origin: it.origin, qty: it.qty, unitPrice: it.unitPrice,
    total: it.qty !== null && it.unitPrice !== null ? round2(it.qty * it.unitPrice) : null,
    weight: it.unitWeight !== null && it.qty !== null ? round2(it.unitWeight * it.qty) : null,
  }));
}

export function invoiceText(b: Booking, carrierKey: string | null): string {
  const rows = invoiceRows(b);
  const tot = rows.reduce((s, x) => s + (x.total || 0), 0), net = rows.reduce((s, x) => s + (x.weight || 0), 0);
  return [
    `COMMERCIAL INVOICE (draft) INV-${b.id}`,
    `Exporter: ${b.seller}, ${b.originCity}, ${b.originCountry}`,
    `Consignee: ${b.destType} in ${b.destCity}, ${b.destCountry}`,
    `Transport: ${carrierKey || '—'}`,
    'Currency: GBP',
    '',
    'SKU\tDescription\tHS code\tOrigin\tQty\tUnit price\tTotal\tNet kg',
    ...rows.map(x => [x.sku, x.description, x.hs || 'MISSING', x.origin || 'MISSING', x.qty ?? '', x.unitPrice ?? '', x.total ?? '', x.weight ?? ''].join('\t')),
    '',
    `Total value: ${money(tot)} (declared ${money(b.declaredValue)})`,
    `Packages: ${fmtNum(b.pallets)} pallets, ${fmtNum(b.cartons)} cartons`,
    `Net weight: ${kg(net)} · Gross weight: ${kg(b.grossWeight)}`,
  ].join('\n');
}

let refSeq = 1;
/** A booking reference such as PF-261026-001K3Q. */
export function makeReference(now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(2), mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0');
  return `PF-${yy}${mm}${dd}-${String(refSeq++).padStart(3, '0')}${Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, 'X')}`;
}
