import { beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readFiles } from '../src/io/readWorkbook';
import { bookingsWorkbook, reportWorkbook, workbookBytes } from '../src/io/writeWorkbook';
import { check } from '../src/domain';
import { fixture, freezeToday } from './setup';

beforeAll(freezeToday);

const enc = (s: string) => new TextEncoder().encode(s);

describe('acceptance 4: the untouched template', () => {
  it('returns zero bookings and the "skipped example row" notice', () => {
    const r = readFiles([{ name: 'Case2_Shipment_Booking_Test_Data_Format.xlsx', data: fixture('Case2_Shipment_Booking_Test_Data_Format.xlsx') }]);
    expect(r.bookings).toHaveLength(0);
    expect(r.skippedExample).toBe(true);
    expect(r.warnings.some(w => /skipped row 3.*example row \(BK-001\)/.test(w.text))).toBe(true);
  });
});

describe('reading', () => {
  it('keeps the example row when it was edited', () => {
    const wb = XLSX.read(fixture('Case2_Shipment_Booking_Test_Data_Format.xlsx'), { type: 'array' });
    wb.Sheets.Bookings['N3'] = { t: 'n', v: 700 }; // gross weight changed
    const r = readFiles([{ name: 'edited.xlsx', data: workbookBytes(wb) }]);
    expect(r.bookings.map(b => b.id)).toEqual(['BK-001']);
    expect(r.bookings[0].items).toHaveLength(0); // the Items example row is still unchanged, so skipped
  });

  it('reads two CSVs, keeps HS codes as text and accepts Excel serial dates', () => {
    const bookings = 'Booking ID,Seller name,Origin city,Origin country,Destination city,Destination country,Destination type,Ready to ship date,Seller priority,Pallets,Cartons,Total declared value,Currency,Total gross weight (kg),Delivery appointment booked\nBK-9,Thistle Tea Co,London,United Kingdom,Paris,France,Business address,30-11-2026,Most reliable,1,40,4000,GBP,260,No\n';
    const items = 'Booking ID,SKU,Description,HS code,Quantity (units),Unit price,Units per carton,Cartons,Unit weight (kg),Country of origin\nBK-9,TEA-01,Loose leaf black tea,090230,800,5,20,40,0.28,India\n';
    const r = readFiles([{ name: 'bookings.csv', data: enc(bookings) }, { name: 'items.csv', data: enc(items) }]);
    expect(r.bookings).toHaveLength(1);
    expect(r.bookings[0].items[0].hs).toBe('090230');
    expect(check(r.bookings[0]).status).toBe('Green');
  });

  it('warns about orphan items, duplicate IDs and rows with no Booking ID', () => {
    const bookings = 'Booking ID,Seller name,Pallets\nBK-1,A,1\nBK-1,B,1\n,C,1\n';
    const items = 'Booking ID,SKU,HS code\nBK-1,X,691200\nBK-404,Y,691200\n,Z,691200\n';
    const r = readFiles([{ name: 'b.csv', data: enc(bookings) }, { name: 'i.csv', data: enc(items) }]);
    const text = r.warnings.map(w => w.text).join('\n');
    expect(text).toMatch(/BK-1 appears more than once/);
    expect(text).toMatch(/Bookings row 4 has no Booking ID/);
    expect(text).toMatch(/refers to booking BK-404, which is not on the Bookings sheet/);
    expect(text).toMatch(/Items row 4 has no Booking ID/);
    expect(r.bookings.map(b => b.id)).toEqual(['BK-1', 'BK-1 (2)']);
  });

  it('maps columns by name, not position', () => {
    const bookings = 'Pallets,Seller name,Booking ID\n2,Shuffled Ltd,BK-7\n';
    const r = readFiles([{ name: 'b.csv', data: enc(bookings) }]);
    expect(r.bookings[0]).toMatchObject({ id: 'BK-7', seller: 'Shuffled Ltd', pallets: 2 });
  });
});

describe('writing', () => {
  it('round-trips the corrected bookings file and keeps leading zeros', () => {
    const r = readFiles([{ name: 'sample.xlsx', data: fixture('Preflight_Sample_Test_Data.xlsx') }]);
    const tea = r.bookings.find(b => b.id === 'BK-109')!;
    tea.items[0].hs = '090230';
    const back = readFiles([{ name: 'fixed.xlsx', data: workbookBytes(bookingsWorkbook(r.bookings)) }]);
    expect(back.bookings).toHaveLength(9);
    expect(back.bookings.find(b => b.id === 'BK-109')!.items[0].hs).toBe('090230');
    expect(check(back.bookings.find(b => b.id === 'BK-109')!).status).toBe('Green');
  });

  it('writes an issues report with Summary and Issues sheets', () => {
    const r = readFiles([{ name: 'sample.xlsx', data: fixture('Preflight_Sample_Test_Data.xlsx') }]);
    const wb = reportWorkbook(r.bookings.map(b => check(b)));
    expect(wb.SheetNames).toEqual(['Summary', 'Issues']);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Summary, { header: 1 });
    expect(rows).toHaveLength(10);
  });
});
