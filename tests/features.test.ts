import { beforeAll, describe, expect, it } from 'vitest';
import {
  bookingImpact, carrierWhatIf, check, cheaperAlternatives, consolidationOpportunities, diffBookings, fileImpact, fixAllSafe,
  fmtDate, freightBy, holidayName, issuesByRule, nextWorkingDay, normalizeBooking, onTimeRisk, safeFixes, sellerScorecards,
} from '../src/domain';
import type { Booking } from '../src/domain';
import { readFiles } from '../src/io/readWorkbook';
import { fixture, freezeToday } from './setup';

beforeAll(freezeToday);

const sample = () => readFiles([{ name: 'sample.xlsx', data: fixture('Preflight_Sample_Test_Data.xlsx') }]).bookings;
const byId = (bs: Booking[], id: string) => bs.find(b => b.id === id) as Booking;

describe('holidays', () => {
  it('knows UK, German, French and Dutch public holidays', () => {
    expect(holidayName(new Date(2026, 11, 25), 'United Kingdom')).toBe('Christmas Day');
    expect(holidayName(new Date(2026, 9, 3), 'Germany')).toBe('Tag der Deutschen Einheit');
    expect(holidayName(new Date(2026, 10, 11), 'France')).toBe('Armistice');
    expect(holidayName(new Date(2027, 3, 27), 'Netherlands')).toBe('Koningsdag');
    expect(holidayName(new Date(2026, 10, 12), 'France')).toBeNull();
  });

  it('collection skips weekends and UK bank holidays', () => {
    expect(fmtDate(nextWorkingDay(new Date(2026, 11, 25)))).toBe('29-12-2026'); // Fri 25 → Mon 28 is Boxing Day (substitute) → Tue 29
  });

  it('flags an arrival on a destination holiday as an info note only', () => {
    const b = normalizeBooking({ ...byId(sample(), 'BK-109'), readyDate: '06-11-2026', priority: 'Fastest', items: byId(sample(), 'BK-109').items.map(i => ({ ...i, hs: '090230' })) });
    const r = check(b); // Fri 06-11 + 2 days (Carrier C) = Sun 08-11
    expect(r.issues.find(i => i.rule === 'X-13')?.severity).toBe('Info');
    expect(r.status).toBe('Green');
  });
});

describe('dangerous goods detail', () => {
  it('R-06 carries the UN number, class and what a DG shipment needs', () => {
    const r = check(byId(sample(), 'BK-103'));
    const dg = r.issues.find(i => i.rule === 'R-06')?.dg;
    expect(dg?.un).toMatch(/UN3480/);
    expect(dg?.cls).toMatch(/Class 9/);
    expect(dg?.needs.length).toBeGreaterThan(2);
  });
});

describe('cost and delay avoided', () => {
  it('estimates per booking and per file', () => {
    const results = sample().map(b => check(b));
    const r102 = bookingImpact(results.find(r => r.booking.id === 'BK-102')!);
    expect(r102.lines.map(l => l.rule).sort()).toEqual(['R-01', 'R-02']);
    expect(r102.cost).toBe(400);
    expect(r102.days).toBe(3);
    const f = fileImpact(results);
    expect(f.bookings).toBe(7);
    expect(f.cost).toBeGreaterThan(1000);
  });
});

describe('fix all safe issues', () => {
  it('fixes totals and leading zeros, leaves judgement calls alone', () => {
    const bs = sample();
    const fixed102 = fixAllSafe(byId(bs, 'BK-102'));
    expect(fixed102.applied).toEqual(['Set declared value to £3,660']);
    expect(check(fixed102.booking).issues.map(i => i.rule)).toEqual(['R-01']); // HS code still needs a human

    const fixed109 = fixAllSafe(byId(bs, 'BK-109'));
    expect(fixed109.applied).toEqual(['Use 090230 (restore leading zero)']);
    expect(check(fixed109.booking).status).toBe('Green');

    // BK-104 has an R-03 line mismatch, so the carton total is not trusted
    expect(safeFixes(check(byId(bs, 'BK-104'))).length).toBe(0);
  });
});

describe('cheaper alternatives', () => {
  it('BK-105: Carrier B on 3 pallets beats the ineligible Carrier C', () => {
    const alts = cheaperAlternatives(byId(sample(), 'BK-105'));
    expect(alts[0]).toMatchObject({ carrier: 'Carrier B', pallets: 3, cost: 630 });
    expect(alts[0].actions.map(a => a.type)).toEqual(['setBooking', 'carrier']);
  });

  it('BK-101: fewer pallets is offered with the caveat that the goods must fit', () => {
    // 620 kg: Carrier B (750 kg max) could take it on 1 pallet; Carrier A (500 kg) on 2
    const alts = cheaperAlternatives(byId(sample(), 'BK-101'));
    expect(alts.map(a => [a.carrier, a.pallets, a.cost])).toEqual([['Carrier B', 1, 220], ['Carrier A', 2, 360]]);
    expect(alts[0].text).toMatch(/only if the goods fit on 1 pallet/);
  });
});

describe('consolidation', () => {
  it('groups same seller, same route, ready within 3 days', () => {
    const bs = sample();
    const a = byId(bs, 'BK-101');
    const twin = normalizeBooking({ ...a, id: 'BK-901', readyDate: '13-11-2026', pallets: 1, grossWeight: 150, cartons: 20, items: [{ ...a.items[0], qty: 240, cartons: 20 }] });
    const ops = consolidationOpportunities([check(a), check(twin), ...bs.slice(1).map(b => check(b))]);
    expect(ops).toHaveLength(1);
    expect(ops[0].ids).toEqual(['BK-101', 'BK-901']);
    expect(ops[0].combinedPallets).toBe(2); // 770 kg on Carrier B (750) needs 2
    expect(ops[0].saving).toBeGreaterThan(0);
  });

  it('finds nothing in the sample file', () => {
    expect(consolidationOpportunities(sample().map(b => check(b)))).toHaveLength(0);
  });
});

describe('before/after diff', () => {
  it('lists every changed cell, and removed lines by SKU', () => {
    const bs = sample();
    const after = bs.map(b => (b.id === 'BK-103' ? normalizeBooking({ ...b, cartons: 30, items: b.items.filter(i => i.sku !== 'PWB-01') }) : b));
    const d = diffBookings(bs, after);
    expect(d).toContainEqual(expect.objectContaining({ bookingId: 'BK-103', sheet: 'Bookings', field: 'Cartons', from: '60', to: '30' }));
    expect(d).toContainEqual(expect.objectContaining({ bookingId: 'BK-103', sheet: 'Items', sku: 'PWB-01', to: '(removed)' }));
  });
});

describe('insights', () => {
  const results = sample().map(b => check(b));

  it('counts bookings per rule', () => {
    const counts = Object.fromEntries(issuesByRule(results).map(c => [c.rule, c.count]));
    expect(counts['R-01']).toBe(2);
    expect(counts['R-06']).toBe(2);
    expect(counts['R-05']).toBe(1);
  });

  it('scores each seller', () => {
    const s = sellerScorecards(results);
    expect(s).toHaveLength(9);
    expect(s.find(x => x.seller === 'Northfield Goods')?.cleanRate).toBe(100);
    expect(s.find(x => x.seller === 'Capital Beauty')?.topRules).toEqual(expect.arrayContaining(['R-06', 'R-10']));
  });

  it('breaks freight down by carrier and route', () => {
    const total = results.reduce((s, r) => s + (r.rec.chosen?.cost || 0), 0);
    expect(freightBy(results, 'carrier').reduce((s, x) => s + x.value, 0)).toBe(total);
    expect(freightBy(results, 'route').map(x => x.label).sort()).toEqual(['UK → France', 'UK → Germany', 'UK → Netherlands']);
  });

  it('rates on-time risk', () => {
    expect(onTimeRisk(results.find(r => r.booking.id === 'BK-101')!).level).toBe('Low');
    expect(onTimeRisk(results.find(r => r.booking.id === 'BK-107')!).level).toBe('High');
  });

  it('what-if: Carrier A +30% pushes Cheapest bookings to Carrier B', () => {
    const w = carrierWhatIf(sample(), {}, 'Carrier A', 30);
    expect(w.after).toBeGreaterThan(w.before);
    expect(w.switched.map(s => s.id)).toEqual(expect.arrayContaining(['BK-101', 'BK-104'])); // A £180→£234 > B £220 per pallet in Germany
    expect(w.switched.every(s => s.from.startsWith('Carrier A') && s.to.startsWith('Carrier B'))).toBe(true);
    const none = carrierWhatIf(sample(), {}, 'Carrier B', 0);
    expect(none.switched).toHaveLength(0);
    expect(none.after).toBe(none.before);
  });
});
