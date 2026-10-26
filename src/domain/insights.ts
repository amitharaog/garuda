/* Figures for the Insights tab: mistakes by rule, seller scorecards, freight breakdowns, on-time risk and a carrier price what-if. */
import { CARRIERS, RULES } from './reference';
import { check } from './rules';
import { bookingImpact } from './impact';
import type { Booking, CheckResult } from './types';

export interface RuleCount {
  rule: string;
  text: string;
  severity: string;
  count: number;
}

/** How many bookings break each rulebook rule. */
export function issuesByRule(results: CheckResult[]): RuleCount[] {
  return RULES.map(rule => ({
    rule: rule.id, text: rule.text, severity: rule.severity,
    count: results.filter(r => r.issues.some(i => i.rule === rule.id && (i.severity === 'Red' || i.severity === 'Amber'))).length,
  }));
}

export interface SellerScore {
  seller: string;
  bookings: number;
  red: number;
  amber: number;
  green: number;
  /** Share of bookings that were ready to go without fixes (0–100). */
  cleanRate: number;
  topRules: string[];
  freight: number;
  costAvoided: number;
}

export function sellerScorecards(results: CheckResult[]): SellerScore[] {
  const map = new Map<string, CheckResult[]>();
  for (const r of results) {
    const s = r.booking.seller || '(no seller)';
    map.set(s, [...(map.get(s) || []), r]);
  }
  return [...map.entries()].map(([seller, rs]) => {
    const counts = new Map<string, number>();
    rs.forEach(r => new Set(r.issues.filter(i => i.severity === 'Red' || i.severity === 'Amber').map(i => i.rule)).forEach(k => counts.set(k, (counts.get(k) || 0) + 1)));
    const green = rs.filter(r => r.status === 'Green').length;
    return {
      seller, bookings: rs.length, green,
      red: rs.filter(r => r.status === 'Red').length, amber: rs.filter(r => r.status === 'Amber').length,
      cleanRate: Math.round((green / rs.length) * 100),
      topRules: [...counts.entries()].sort((a, z) => z[1] - a[1]).slice(0, 3).map(([k]) => k),
      freight: rs.reduce((s, r) => s + (r.rec.chosen?.cost || 0), 0),
      costAvoided: rs.reduce((s, r) => s + bookingImpact(r).cost, 0),
    };
  }).sort((a, z) => z.red - a.red || z.amber - a.amber || a.seller.localeCompare(z.seller));
}

export interface Slice {
  label: string;
  value: number;
  count: number;
}

export function freightBy(results: CheckResult[], by: 'carrier' | 'route'): Slice[] {
  const map = new Map<string, Slice>();
  for (const r of results) {
    const ch = r.rec.chosen;
    if (!ch || ch.cost === null) continue;
    const label = by === 'carrier' ? ch.key : `UK → ${r.booking.destCountry || '?'}`;
    const s = map.get(label) || { label, value: 0, count: 0 };
    s.value += ch.cost;
    s.count += 1;
    map.set(label, s);
  }
  return [...map.values()].sort((a, z) => z.value - a.value);
}

export interface Risk {
  id: string;
  score: number;
  level: 'Low' | 'Medium' | 'High';
  reasons: string[];
}

/** 0–100 chance-style score that the shipment arrives late or not at all. A heuristic, not a forecast. */
export function onTimeRisk(r: CheckResult): Risk {
  const reasons: string[] = [];
  let score = 0;
  const ch = r.rec.chosen;
  if (ch) { score += 100 - ch.c.ontime; reasons.push(`${ch.c.carrier} is on time ${ch.c.ontime}% of the time`); }
  const reds = r.issues.filter(i => i.severity === 'Red').length, ambers = r.issues.filter(i => i.severity === 'Amber').length;
  if (reds) { score += 45; reasons.push(`${reds} red issue${reds > 1 ? 's' : ''} would stop it`); }
  if (ambers) { score += 12 * ambers; reasons.push(`${ambers} amber warning${ambers > 1 ? 's' : ''}`); }
  if (r.issues.some(i => i.rule === 'X-13')) { score += 8; reasons.push('arrives on a non-working day'); }
  score = Math.min(100, Math.round(score));
  return { id: r.booking.id, score, level: score >= 40 ? 'High' : score >= 15 ? 'Medium' : 'Low', reasons };
}

export interface WhatIf {
  carrier: string;
  pct: number;
  before: number;
  after: number;
  switched: Array<{ id: string; from: string; to: string; costBefore: number; costAfter: number }>;
}

/** Re-run every booking with one carrier's prices changed by pct (e.g. +10). */
export function carrierWhatIf(bookings: Booking[], overrides: Record<string, string | undefined>, carrier: string, pct: number): WhatIf {
  const changed = CARRIERS.map(c => (c.carrier === carrier ? { ...c, price: Math.round(c.price * (1 + pct / 100) * 100) / 100 } : c));
  let before = 0, after = 0;
  const switched: WhatIf['switched'] = [];
  for (const b of bookings) {
    const r0 = check(b, { carrierOverride: overrides[b.id] });
    const r1 = check(b, { carrierOverride: overrides[b.id], carriers: changed });
    const c0 = r0.rec.chosen, c1 = r1.rec.chosen;
    before += c0?.cost || 0;
    after += c1?.cost || 0;
    if (c0 && c1 && c0.key !== c1.key) switched.push({ id: b.id, from: c0.key, to: c1.key, costBefore: c0.cost || 0, costAfter: c1.cost || 0 });
  }
  return { carrier, pct, before: Math.round(before * 100) / 100, after: Math.round(after * 100) / 100, switched };
}
