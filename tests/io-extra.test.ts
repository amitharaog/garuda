import { beforeAll, describe, expect, it } from 'vitest';
import { check } from '../src/domain';
import type { Booking } from '../src/domain';
import { readFiles } from '../src/io/readWorkbook';
import { CODE128_PATTERNS, code128Svg, code128Values } from '../src/io/barcode';
import { decodeBooking, encodeBooking, shareUrl } from '../src/io/share';
import { allProducts, lastBooking, loadProfiles, matchProduct, rememberBooking } from '../src/io/profiles';
import type { StorageLike } from '../src/io/profiles';
import { buildPrintPack, exportChecklist } from '../src/io/print';
import { fixture, freezeToday } from './setup';

beforeAll(freezeToday);

const sample = () => readFiles([{ name: 'sample.xlsx', data: fixture('Preflight_Sample_Test_Data.xlsx') }]).bookings;
const byId = (bs: Booking[], id: string) => bs.find(b => b.id === id) as Booking;
const memory = (): StorageLike & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};

describe('barcode', () => {
  it('every Code 128 pattern is 11 modules wide (stop is 13) and unique', () => {
    CODE128_PATTERNS.forEach((p, i) => expect([...p].reduce((s, d) => s + +d, 0)).toBe(i === 106 ? 13 : 11));
    expect(new Set(CODE128_PATTERNS).size).toBe(CODE128_PATTERNS.length);
  });

  it('computes the checksum', () => {
    // 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879; 879 mod 103 = 55
    expect(code128Values('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
    expect(code128Svg('BK-101-C0001')).toMatch(/^<svg/);
    expect(() => code128Values('é')).toThrow();
  });
});

describe('share links', () => {
  it('round-trips a booking and the carrier override', () => {
    const b = byId(sample(), 'BK-102');
    const url = shareUrl('https://example.test/#file', b, 'Carrier C · Road express');
    expect(url).toMatch(/^https:\/\/example\.test\/#share=/);
    const back = decodeBooking(url.split('#share=')[1]);
    expect(back?.carrierOverride).toBe('Carrier C · Road express');
    expect(check(back!.booking).issues.map(i => i.rule)).toEqual(check(b).issues.map(i => i.rule));
    expect(back?.booking.items[1].description).toBe('Cotton t-shirt, printed');
  });

  it('rejects junk', () => {
    expect(decodeBooking('not-base64!!')).toBeNull();
    expect(decodeBooking(encodeBooking({ ...byId(sample(), 'BK-101'), id: '' }))).toBeNull();
  });
});

describe('saved sellers and products', () => {
  it('remembers confirmed bookings and matches products by name', () => {
    const s = memory();
    rememberBooking(s, byId(sample(), 'BK-101'), 1);
    rememberBooking(s, byId(sample(), 'BK-109'), 2);
    const p = loadProfiles(s);
    expect(Object.keys(p)).toEqual(['northfield goods', 'thistle tea co']);
    expect(lastBooking(p)?.id).toBe('BK-109');
    const mug = matchProduct(allProducts(p), 'ceramic coffee mugs');
    expect(mug).toMatchObject({ hs: '691200', upc: 12, unitWeight: 0.5, origin: 'United Kingdom' });
    expect(matchProduct(allProducts(p), 'coffee beans')).toBeNull(); // shares "coffee" but not the head noun
  });

  it('survives broken or missing storage', () => {
    expect(loadProfiles(null)).toEqual({});
    expect(loadProfiles({ getItem: () => '{bad json', setItem: () => {} })).toEqual({});
    expect(() => rememberBooking({ getItem: () => null, setItem: () => { throw new Error('full'); } }, byId(sample(), 'BK-101'))).not.toThrow();
  });
});

describe('print pack', () => {
  it('builds every document, with a label per pallet and per carton', () => {
    const r = check(byId(sample(), 'BK-101'));
    const html = buildPrintPack(r, 'PF-261026-001ABC');
    for (const h of ['Commercial invoice', 'Packing list', 'Export checklist', 'Pallet 3 of 3', 'Carton 90 of 90']) expect(html).toContain(h);
    expect((html.match(/class="lbl"/g) || []).length).toBe(3 + 90);
    expect(html).toContain('PF-261026-001ABC-C0090');
  });

  it('escapes booking text and flags missing data', () => {
    const b = byId(sample(), 'BK-102');
    const r = check({ ...b, seller: '<script>x</script>' });
    const html = buildPrintPack(r, null, ['invoice', 'checklist']);
    expect(html).not.toContain('<script>x');
    expect(html).toContain('MISSING');
    expect(html).toContain('Draft: this booking is not confirmed yet.');
    expect(exportChecklist(r).find(c => c.label.startsWith('Commodity'))?.state).toBe('missing');
  });
});
