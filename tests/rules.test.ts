import { beforeAll, describe, expect, it } from 'vitest';
import { applyAction, check, confirmation, hsDigits, normalizeBooking, detectDG, parseDate, nextWorkingDay, fmtDate } from '../src/domain';
import type { Booking, CheckResult } from '../src/domain';
import { readFiles } from '../src/io/readWorkbook';
import { fromRows } from '../src/io/assemble';
import { SAMPLE_BOOKING_ROWS, SAMPLE_ITEM_ROWS } from '../src/data/sample';
import { fixture, freezeToday } from './setup';

beforeAll(freezeToday);

const blocking = (r: CheckResult) => r.issues.filter(i => i.severity === 'Red' || i.severity === 'Amber');
const rulesOf = (r: CheckResult) => [...new Set(blocking(r).map(i => i.rule))].sort();

function sampleResults() {
  const { bookings } = readFiles([{ name: 'Preflight_Sample_Test_Data.xlsx', data: fixture('Preflight_Sample_Test_Data.xlsx') }]);
  return Object.fromEntries(bookings.map(b => [b.id, check(b)]));
}

describe('acceptance 1: sample file results', () => {
  const R = sampleResults();

  it('reads all 9 bookings (the unchanged BK-001 example row is skipped)', () => {
    expect(Object.keys(R)).toEqual(['BK-101', 'BK-102', 'BK-103', 'BK-104', 'BK-105', 'BK-106', 'BK-107', 'BK-108', 'BK-109']);
  });

  const expected: Array<[string, string, string[]]> = [
    ['BK-101', 'Green', []],
    ['BK-102', 'Red', ['R-01', 'R-02']],
    ['BK-103', 'Red', ['R-06', 'R-08']],
    ['BK-104', 'Red', ['R-03', 'R-04']],
    ['BK-105', 'Red', ['R-05']],
    ['BK-106', 'Amber', ['R-07', 'R-09']],
    ['BK-107', 'Red', ['R-06', 'R-10']],
    ['BK-108', 'Green', []],
    ['BK-109', 'Red', ['R-01']],
  ];
  it.each(expected)('%s is %s with %j', (id, status, rules) => {
    expect(R[id].status).toBe(status);
    expect(rulesOf(R[id])).toEqual(rules);
  });

  it('BK-103 R-08 and BK-107 R-10 are amber', () => {
    expect(R['BK-103'].issues.find(i => i.rule === 'R-08')?.severity).toBe('Amber');
    expect(R['BK-107'].issues.find(i => i.rule === 'R-10')?.severity).toBe('Amber');
  });

  it('BK-105: no carrier can take 850 kg per pallet', () => {
    const r = R['BK-105'];
    expect(r.totals.wpp).toBe(850);
    expect(r.rec.mode).toBe('none-eligible');
    expect(r.rec.options.every(o => o.eligible === false)).toBe(true);
    expect(r.issues.find(i => i.rule === 'R-05')?.severity).toBe('Red');
  });

  it('BK-108: R-05 notice, switched from Carrier A to Carrier B', () => {
    const r = R['BK-108'];
    const n = r.issues.find(i => i.rule === 'R-05');
    expect(n?.severity).toBe('Notice');
    expect(r.rec.preferred?.c.carrier).toBe('Carrier A');
    expect(r.rec.chosen?.c.carrier).toBe('Carrier B');
    expect(n?.what).toMatch(/Carrier A · Road economy would normally win/);
  });

  it('BK-109: 5-digit 90230 with a leading-zero hint', () => {
    const i = R['BK-109'].issues.find(x => x.rule === 'R-01');
    expect(R['BK-109'].booking.items[0].hs).toBe('90230');
    expect(i?.what).toMatch(/only 5 digits/);
    expect(i?.fixes?.map(f => f.label)).toContain('Use 090230 (restore leading zero)');
  });

  it('fix buttons carry the real numbers', () => {
    expect(R['BK-102'].issues.find(i => i.rule === 'R-02')?.fixes?.[0].label).toBe('Set declared value to £3,660');
    expect(R['BK-102'].issues.find(i => i.rule === 'R-01')?.fixes?.map(f => f.label)).toContain('Use suggested 340600');
    expect(R['BK-103'].issues.find(i => i.rule === 'R-06')?.fixes?.[0].label).toBe('Remove PWB-01 from shipment');
    // Carrier C (max 400 kg) needs 5 pallets; Carrier B (max 750 kg) fits on 3.
    expect(R['BK-105'].issues.find(i => i.rule === 'R-05')?.fixes?.map(f => f.label)).toEqual(['Use 5 pallets', 'Use 3 pallets (fits Carrier B)']);
  });

  it('the built-in sample matches the sample workbook', () => {
    const { bookings } = fromRows(SAMPLE_BOOKING_ROWS, SAMPLE_ITEM_ROWS);
    for (const b of bookings) {
      expect(check(b).status).toBe(R[b.id].status);
      expect(rulesOf(check(b))).toEqual(rulesOf(R[b.id]));
    }
  });
});

describe('acceptance 5: removing a dangerous item', () => {
  const R = sampleResults();

  it('lowers cartons and gross weight; declared value drops only because it included the item', () => {
    const b = R['BK-103'].booking;
    const nb = applyAction(b, { type: 'removeItem', index: 1 }); // PWB-01
    expect(nb.items.map(i => i.sku)).toEqual(['CBL-01']);
    expect(nb.cartons).toBe(30);
    expect(nb.grossWeight).toBe(380 - 600 * 0.25);
    expect(nb.declaredValue).toBe(4800);
    const r = check(nb);
    expect(rulesOf(r)).toEqual(['R-08']);
  });

  it('keeps the declared value when it never included the removed item', () => {
    const b: Booking = normalizeBooking({
      id: 'T', seller: 'S', originCity: 'London', originCountry: 'United Kingdom', destCity: 'Berlin', destCountry: 'Germany', destType: 'Business address',
      readyDate: '02-11-2026', priority: 'Cheapest', pallets: 1, cartons: 30, declaredValue: 4800, currency: 'GBP', grossWeight: 400, appointment: 'No',
      items: [
        { sku: 'CBL-01', description: 'USB-C cable', hs: '854442', qty: 1200, unitPrice: 4, upc: 40, cartons: 30, unitWeight: 0.05, origin: 'China' },
        { sku: 'PWB-01', description: 'Lithium power bank', hs: '850760', qty: 600, unitPrice: 8, upc: 20, cartons: 30, unitWeight: 0.25, origin: 'China' },
      ],
    });
    const nb = applyAction(b, { type: 'removeItem', index: 1 });
    expect(nb.declaredValue).toBe(4800);
    expect(nb.cartons).toBe(0);
    expect(nb.grossWeight).toBe(250);
  });
});

describe('rule details', () => {
  it('R-01 counts digits only', () => {
    expect(hsDigits('6912.00')).toBe('691200');
  });

  it('R-06 ignores negations', () => {
    expect(detectDG('Battery-free LED candle')).toBeNull();
    expect(detectDG('Non-flammable cleaning gel')).toBeNull();
    expect(detectDG('Lithium-ion power bank')?.cat).toBe('lithium battery');
    expect(detectDG('Perfume 50 ml')?.cat).toBe('flammable liquid');
  });

  it('dates: DD-MM-YYYY text, Excel serials, next working day', () => {
    expect(fmtDate(parseDate('05-11-2026'))).toBe('05-11-2026');
    expect(parseDate('31-02-2026')).toBeNull();
    expect(fmtDate(parseDate(46331))).toBe('05-11-2026');
    expect(fmtDate(nextWorkingDay(new Date(2026, 9, 31)))).toBe('02-11-2026'); // Saturday → Monday
  });

  it('extra checks are labelled and never mixed with the rulebook', () => {
    const r = check({ id: 'X', seller: 'S', originCity: 'London', originCountry: 'United Kingdom', destCity: 'Paris', destCountry: 'Germany', destType: 'Business address', readyDate: '32-13-2026', priority: 'Cheapest', pallets: 1, cartons: 1, declaredValue: 5, currency: 'EUR', grossWeight: 10, appointment: 'No', items: [{ sku: 'A', description: 'Mug', hs: '691200', qty: 1, unitPrice: 5, upc: 1, cartons: 1, unitWeight: 1, origin: 'China' }] });
    const extra = r.issues.filter(i => i.extra).map(i => i.rule).sort();
    expect(extra).toEqual(['X-05', 'X-07', 'X-08']);
    expect(r.issues.find(i => i.rule === 'X-07')?.severity).toBe('Amber');
    expect(r.issues.find(i => i.rule === 'X-05')?.severity).toBe('Red');
  });

  it('X-01 flags missing required fields', () => {
    const r = check({ id: 'X', items: [] });
    expect(r.status).toBe('Red');
    expect(r.issues[0].rule).toBe('X-01');
  });

  it('confirmation: collection on the next working day, ETA = ready + transit', () => {
    const R = sampleResults();
    const c = confirmation(R['BK-101']);
    expect(c.headline).toMatch(/passed all 10 pre-flight checks/);
    expect(R['BK-101'].eta && fmtDate(R['BK-101'].eta)).toBe('17-11-2026'); // 12-11 + 5 days (Carrier A)
    expect(c.next.length).toBeGreaterThan(3);
  });
});
