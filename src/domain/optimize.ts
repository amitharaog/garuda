/* Going beyond "what's wrong": safe one-click fixes, cheaper carrier/pallet options, and consolidation. */
import { recommendCarrier, carrierKey, routeCarriers } from './carriers';
import { applyAction } from './fixes';
import { normalizeBooking } from './normalize';
import { check } from './rules';
import { parseDate } from './dates';
import { kg, money, plural } from './format';
import type { Action, Booking, CheckResult, Fix } from './types';

// ---------- Safe fixes ----------

/** Fixes with only one sensible answer. Totals are only trusted when every item line is internally consistent (no R-03). */
export function safeFixes(r: CheckResult): Fix[] {
  const out: Fix[] = [];
  const lineProblems = r.issues.some(i => i.rule === 'R-03');
  for (const i of r.issues) {
    if (i.rule === 'R-01') {
      const f = i.fixes?.find(x => /restore leading zero/.test(x.label));
      if (f) out.push(f);
    }
  }
  if (!lineProblems) {
    const r04 = r.issues.find(i => i.rule === 'R-04')?.fixes?.[0];
    if (r04) out.push(r04);
    const r02 = r.issues.find(i => i.rule === 'R-02')?.fixes?.[0];
    if (r02) out.push(r02);
  }
  return out;
}

/** Apply every safe fix until none are left. Returns the fixed booking and what changed. */
export function fixAllSafe(booking: Booking, carrierOverride?: string | null): { booking: Booking; applied: string[] } {
  let b = booking;
  const applied: string[] = [];
  for (let guard = 0; guard < 20; guard++) {
    const fixes = safeFixes(check(b, { carrierOverride }));
    if (!fixes.length) break;
    const f = fixes[0];
    b = { ...normalizeBooking(applyAction(b, f.action)), _row: b._row };
    applied.push(f.label);
  }
  return { booking: b, applied };
}

// ---------- Cheaper alternatives ----------

export interface Alternative {
  carrier: string;
  key: string;
  pallets: number;
  cost: number;
  saving: number;
  transit: number;
  ontime: number;
  text: string;
  /** Actions that turn the booking into this option. */
  actions: Action[];
}

/** Carrier + pallet-count combinations that would cost less than the current pick and still pass R-05. */
export function cheaperAlternatives(b: Booking, carrierOverride?: string | null, limit = 3): Alternative[] {
  const rec = recommendCarrier(b, carrierOverride);
  const ch = rec.chosen;
  if (!ch || ch.cost === null || b.grossWeight === null || !b.pallets) return [];
  const gw = b.grossWeight, now = b.pallets;
  const out: Alternative[] = [];
  for (const c of routeCarriers(b.destCountry)) {
    const p = Math.max(1, Math.ceil(gw / c.maxKg - 1e-9));
    const cost = p * c.price;
    const saving = ch.cost - cost;
    if (saving <= 0) continue;
    const key = carrierKey(c);
    if (key === ch.key && p === now) continue;
    const palletNote = p < now
      ? `only if the goods fit on ${plural(p, 'pallet')} (${kg(gw / p)} each)`
      : p > now ? `spread over ${plural(p, 'pallet')} (${kg(gw / p)} each)` : `on the same ${plural(p, 'pallet')}`;
    const tradeoff = [c.transit !== ch.c.transit ? `${c.transit} days in transit (${c.transit > ch.c.transit ? '+' : ''}${c.transit - ch.c.transit})` : '', c.ontime !== ch.c.ontime ? `${c.ontime}% on time` : ''].filter(Boolean).join(', ');
    const actions: Action[] = [];
    if (p !== now) actions.push({ type: 'setBooking', field: 'pallets', value: p, label: `Use ${p} pallets` });
    if (key !== ch.key) actions.push({ type: 'carrier', value: key, label: `Use ${c.carrier}` });
    out.push({
      carrier: c.carrier, key, pallets: p, cost, saving, transit: c.transit, ontime: c.ontime, actions,
      text: `${key}, ${palletNote}: ${money(cost)}, saving ${money(saving)}${tradeoff ? ` · ${tradeoff}` : ''}.`,
    });
  }
  return out.sort((a, z) => z.saving - a.saving).slice(0, limit);
}

// ---------- Consolidation ----------

export interface Consolidation {
  ids: string[];
  seller: string;
  route: string;
  readyDates: string[];
  pallets: number;
  grossWeight: number;
  currentCost: number;
  /** Fewest pallets the combined weight needs with the cheapest carrier that can take it. */
  combinedPallets: number;
  combinedCost: number;
  combinedCarrier: string;
  saving: number;
  text: string;
}

const DAY = 864e5;

/** Bookings from the same seller to the same place, ready within `windowDays` of each other. */
export function consolidationOpportunities(results: CheckResult[], windowDays = 3): Consolidation[] {
  const groups = new Map<string, CheckResult[]>();
  for (const r of results) {
    const b = r.booking;
    if (!b.seller || !b.originCity || !b.destCity || !parseDate(b.readyDate)) continue;
    const k = [b.seller.toLowerCase(), b.originCity, b.destCity, b.destType].join('|');
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  const out: Consolidation[] = [];
  for (const list of groups.values()) {
    const sorted = list.slice().sort((a, z) => (parseDate(a.booking.readyDate) as Date).getTime() - (parseDate(z.booking.readyDate) as Date).getTime());
    let cluster: CheckResult[] = [];
    const flush = () => {
      if (cluster.length > 1) {
        const c = summarise(cluster);
        if (c) out.push(c);
      }
    };
    for (const r of sorted) {
      const d = (parseDate(r.booking.readyDate) as Date).getTime();
      const first = cluster.length ? (parseDate(cluster[0].booking.readyDate) as Date).getTime() : d;
      if (cluster.length && d - first > windowDays * DAY) { flush(); cluster = []; }
      cluster.push(r);
    }
    flush();
  }
  return out.sort((a, z) => z.saving - a.saving);
}

function summarise(cluster: CheckResult[]): Consolidation | null {
  const bs = cluster.map(r => r.booking);
  const pallets = bs.reduce((s, b) => s + (b.pallets || 0), 0);
  const grossWeight = bs.reduce((s, b) => s + (b.grossWeight || 0), 0);
  const currentCost = cluster.reduce((s, r) => s + (r.rec.chosen?.cost || 0), 0);
  const options = routeCarriers(bs[0].destCountry).map(c => {
    // Lower bound: the weight limit only. Volume is unknown, so this is a best case.
    const p = Math.max(1, Math.ceil(grossWeight / c.maxKg - 1e-9));
    return { c, p, cost: p * c.price };
  }).sort((a, z) => a.cost - z.cost);
  const best = options[0];
  if (!best) return null;
  const saving = Math.max(0, currentCost - best.cost);
  const ids = bs.map(b => b.id);
  return {
    ids, seller: bs[0].seller, route: `${bs[0].originCity} → ${bs[0].destCity}`, readyDates: bs.map(b => b.readyDate),
    pallets, grossWeight, currentCost, combinedPallets: best.p, combinedCost: best.cost, combinedCarrier: carrierKey(best.c), saving,
    text: `${ids.join(' + ')} (${bs[0].seller}, ${bs[0].originCity} → ${bs[0].destCity}) are ready within a few days of each other: one collection instead of ${cluster.length}. At best (if the goods physically fit), the combined ${kg(grossWeight)} goes on ${plural(best.p, 'pallet')} with ${carrierKey(best.c)} for ${money(best.cost)} vs ${money(currentCost)} today${saving > 0 ? `, saving up to ${money(saving)}` : ''}.`,
  };
}
