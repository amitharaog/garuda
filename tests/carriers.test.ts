import { describe, expect, it } from 'vitest';
import { check, evaluateCarriers, normalizeBooking, recommendCarrier } from '../src/domain';
import type { Priority } from '../src/domain';

const bk001 = (priority: Priority, over: Record<string, unknown> = {}) =>
  normalizeBooking({
    id: 'BK-001', seller: 'Northfield Goods', originCity: 'Manchester', originCountry: 'United Kingdom', destCity: 'Frankfurt', destCountry: 'Germany',
    destType: 'Warehouse', readyDate: '05-11-2026', priority, pallets: 3, cartons: 90, declaredValue: 5400, currency: 'GBP', grossWeight: 620, appointment: 'Yes',
    items: [{ sku: 'MUG-01', description: 'Ceramic coffee mug, 350 ml', hs: 691200, qty: 1080, unitPrice: 5, upc: 12, cartons: 90, unitWeight: 0.5, origin: 'United Kingdom' }],
    ...over,
  });

describe('acceptance 2: carrier choice for BK-001 (Manchester → Frankfurt, 3 pallets, 620 kg)', () => {
  const cases: Array<[Priority, string, number]> = [
    ['Cheapest', 'Carrier A', 540],
    ['Fastest', 'Carrier C', 1020],
    ['Most reliable', 'Carrier C', 1020],
    ['Balanced', 'Carrier B', 660],
  ];
  it.each(cases)('%s → %s at £%d', (priority, carrier, cost) => {
    const rec = recommendCarrier(bk001(priority));
    expect(rec.chosen?.c.carrier).toBe(carrier);
    expect(rec.chosen?.cost).toBe(cost);
  });
});

describe('balanced scoring', () => {
  it.each(['Germany', 'France', 'Netherlands'])('picks Carrier B on the %s route', dest => {
    const rec = recommendCarrier(bk001('Balanced', { destCountry: dest, destCity: '' }));
    expect(rec.chosen?.c.carrier).toBe('Carrier B');
  });

  it('scores are min-max across the route (1 = best)', () => {
    const opts = evaluateCarriers(bk001('Balanced'));
    const a = opts.find(o => o.c.carrier === 'Carrier A')!;
    const c = opts.find(o => o.c.carrier === 'Carrier C')!;
    expect(a.scores.cost).toBe(1);
    expect(a.scores.speed).toBe(0);
    expect(c.scores.reliability).toBe(1);
    expect(c.scores.cost).toBe(0);
  });
});

describe('R-05 fallback and override', () => {
  it('skips a too-heavy first choice and explains, including the cost of more pallets', () => {
    // 1,650 kg on 3 pallets = 550 kg each: over Carrier A (500), fine for B (750)
    const r = check(bk001('Cheapest', { grossWeight: 1650 }));
    expect(r.rec.chosen?.c.carrier).toBe('Carrier B');
    const note = r.rec.notes.find(n => n.type === 'r05-switch');
    expect(note?.text).toMatch(/spread the load over 4 pallets/);
    expect(note?.text).toMatch(/£720 vs £660/);
  });

  it('R-05 is red when no carrier fits', () => {
    const r = check(bk001('Cheapest', { grossWeight: 2400 }));
    expect(r.rec.mode).toBe('none-eligible');
    expect(r.issues.find(i => i.rule === 'R-05')?.severity).toBe('Red');
  });

  it('the seller can override the carrier and switch back', () => {
    const b = bk001('Cheapest');
    const over = check(b, { carrierOverride: 'Carrier C · Road express' });
    expect(over.rec.mode).toBe('override');
    expect(over.rec.chosen?.c.carrier).toBe('Carrier C');
    expect(over.rec.notes.some(n => n.type === 'override')).toBe(true);
    const back = check(b, { carrierOverride: null });
    expect(back.rec.chosen?.c.carrier).toBe('Carrier A');
  });

  it('an overridden carrier that is too heavy offers a switch to the cheapest one that fits', () => {
    // 1,400 kg on 3 pallets = 467 kg each: over Carrier C (400), fine for A (500)
    const r = check(bk001('Cheapest', { grossWeight: 1400 }), { carrierOverride: 'Carrier C · Road express' });
    const i = r.issues.find(x => x.rule === 'R-05');
    expect(i?.severity).toBe('Red');
    expect(i?.fixes?.map(f => f.label)).toContain('Switch to Carrier A · Road economy');
  });
});
