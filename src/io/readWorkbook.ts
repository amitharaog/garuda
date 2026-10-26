/* Read the judges' workbook (Sheets 1 & 2: Bookings + Items) or two CSVs into bookings, with warnings.
   Finds the header row by "Booking ID", maps columns by name, keeps HS codes as text and skips the
   template's grey example row (BK-001) only when it is unchanged. */
import * as XLSX from 'xlsx';
import { parseDate, fmtDate } from '../domain/dates';
import { assemble } from './assemble';
import type { ReadResult, ReadWarning, RowObject } from './assemble';

export type { ReadResult, ReadWarning } from './assemble';

export interface InputFile {
  name: string;
  data: Uint8Array | ArrayBuffer;
}

type Row = unknown[];
type Kind = 'bookings' | 'items';

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

const BOOKING_HEAD: Record<string, string> = {
  bookingid: 'id', sellername: 'seller', seller: 'seller', origincity: 'originCity', origincountry: 'originCountry',
  destinationcity: 'destCity', destinationcountry: 'destCountry', destinationtype: 'destType', readytoshipdate: 'readyDate', readydate: 'readyDate',
  sellerpriority: 'priority', priority: 'priority', pallets: 'pallets', cartons: 'cartons', totalcartons: 'cartons',
  totaldeclaredvalue: 'declaredValue', declaredvalue: 'declaredValue', currency: 'currency', totalgrossweight: 'grossWeight',
  grossweight: 'grossWeight', deliveryappointmentbooked: 'appointment', deliveryappointment: 'appointment',
};
const ITEM_HEAD: Record<string, string> = {
  bookingid: 'bookingId', sku: 'sku', description: 'description', hscode: 'hs', quantity: 'qty', quantityunits: 'qty', qty: 'qty',
  unitprice: 'unitPrice', unitspercarton: 'upc', cartons: 'cartons', unitweight: 'unitWeight', countryoforigin: 'origin', origin: 'origin',
};

/** The grey example row (row 3) of the template, as it ships. */
const EXAMPLE_BOOKING: Record<string, string> = {
  id: 'bk001', seller: 'northfieldgoods', originCity: 'manchester', originCountry: 'unitedkingdom', destCity: 'frankfurt', destCountry: 'germany',
  destType: 'warehouse', readyDate: '05112026', priority: 'cheapest', pallets: '3', cartons: '90', declaredValue: '5400', currency: 'gbp',
  grossWeight: '620', appointment: 'yes',
};
const EXAMPLE_ITEM: Record<string, string> = {
  bookingId: 'bk001', sku: 'mug01', description: 'ceramiccoffeemug350ml', hs: '691200', qty: '1080', unitPrice: '5', upc: '12', cartons: '90',
  unitWeight: '05', origin: 'unitedkingdom',
};

const isBlankRow = (r: Row | undefined) => !r || r.every(v => v === null || v === undefined || String(v).trim() === '');

function headerRow(rows: Row[], kind: Kind): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const n = (rows[i] || []).map(norm);
    if (!n.includes('bookingid')) continue;
    if (kind === 'bookings' && (n.includes('sellername') || n.includes('pallets'))) return i;
    if (kind === 'items' && (n.includes('sku') || n.includes('hscode'))) return i;
  }
  return -1;
}

function isExample(o: RowObject, ex: Record<string, string>): boolean {
  return Object.entries(ex).every(([k, v]) => {
    let cell = o[k];
    if (k === 'readyDate' && typeof cell === 'number') cell = fmtDate(parseDate(cell));
    return norm(cell) === v;
  });
}

function parseSheetRows(rows: Row[], kind: Kind, warnings: ReadWarning[], sheetName: string): { rows: RowObject[]; skipped: boolean } | null {
  const h = headerRow(rows, kind);
  if (h < 0) return null;
  const map = kind === 'bookings' ? BOOKING_HEAD : ITEM_HEAD;
  const cols = (rows[h] || []).map(c => map[norm(c)] || null);
  const titleSaysExample = rows.slice(0, h).some(r => (r || []).some(c => /example/i.test(String(c ?? ''))));
  const out: RowObject[] = [];
  let skipped = false;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    if (isBlankRow(r)) continue;
    const o: RowObject = { _row: i + 1 };
    cols.forEach((k, ci) => { if (k && !(k in o && o[k] !== null)) o[k] = r[ci] === undefined ? null : r[ci]; });
    if (i === h + 1 && titleSaysExample && isExample(o, kind === 'bookings' ? EXAMPLE_BOOKING : EXAMPLE_ITEM)) {
      warnings.push({ level: 'info', text: `${sheetName}: skipped row ${i + 1}, the template's grey example row (BK-001), because it is unchanged.` });
      skipped = true;
      continue;
    }
    out.push(o);
  }
  return { rows: out, skipped };
}

interface SheetRows {
  bookings: RowObject[] | null;
  items: RowObject[] | null;
  skipped: boolean;
}

export function readWorkbookRows(wb: XLSX.WorkBook, warnings: ReadWarning[]): SheetRows {
  const res: SheetRows = { bookings: null, items: null, skipped: false };
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    if (!res.bookings) {
      const b = parseSheetRows(rows, 'bookings', warnings, name);
      if (b) { res.bookings = b.rows; res.skipped ||= b.skipped; continue; }
    }
    if (!res.items) {
      const it = parseSheetRows(rows, 'items', warnings, name);
      if (it) { res.items = it.rows; res.skipped ||= it.skipped; }
    }
  }
  return res;
}

const isCsv = (name: string) => /\.csv$/i.test(name);

export function readFiles(files: InputFile[]): ReadResult {
  let bRows: RowObject[] | null = null, iRows: RowObject[] | null = null, skipped = false;
  const warnings: ReadWarning[] = [];
  for (const f of files) {
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    // CSVs are read as plain text so HS codes like 090230 keep their leading zero.
    const wb = isCsv(f.name) ? XLSX.read(new TextDecoder().decode(data), { type: 'string', raw: true }) : XLSX.read(data, { type: 'array' });
    const r = readWorkbookRows(wb, warnings);
    if (r.bookings && !bRows) bRows = r.bookings;
    if (r.items && !iRows) iRows = r.items;
    skipped ||= r.skipped;
  }
  if (!bRows) throw new Error('No Bookings sheet found. The file needs a sheet whose header row starts with "Booking ID" and includes "Seller name" and "Pallets" (Sheet 1 of the template).');
  if (!iRows) warnings.push({ level: 'warn', text: 'No Items sheet found (header row with "Booking ID" and "SKU"). Every booking will be flagged as having no items.' });
  const bookings = assemble(bRows, iRows || [], warnings);
  if (!bookings.length) warnings.push({ level: 'warn', text: 'No bookings found below the header row. Enter bookings from row 4 of the Bookings sheet.' });
  return { bookings, warnings, skippedExample: skipped };
}
