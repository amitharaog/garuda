/* Assemble mapped sheet rows into bookings (no SheetJS here, so the app can start without loading it). */
import { normalizeBooking, normalizeItem } from '../domain/normalize';
import type { Booking, RawBooking, RawItem } from '../domain/types';

export interface ReadWarning {
  level: 'info' | 'warn';
  text: string;
}
export interface ReadResult {
  bookings: Booking[];
  warnings: ReadWarning[];
  /** True when the template's example row was skipped on either sheet. */
  skippedExample: boolean;
}

export type RowObject = Record<string, unknown> & { _row: number };

/** Turn row objects into bookings with nested items; warn about orphans, duplicates and missing IDs. */
export function assemble(bRows: RowObject[], iRows: RowObject[], warnings: ReadWarning[] = []): Booking[] {
  const bookings: Array<RawBooking & { items: RawItem[] }> = [];
  const byId: Record<string, RawBooking & { items: RawItem[] }> = {};
  for (const r of bRows) {
    let id = r.id == null ? '' : String(r.id).trim();
    if (!id) { warnings.push({ level: 'warn', text: `Bookings row ${r._row} has no Booking ID, so it was skipped.` }); continue; }
    if (byId[id]) {
      warnings.push({ level: 'warn', text: `Booking ID ${id} appears more than once (row ${r._row}). Booking IDs must be unique; the second copy is shown as ${id} (2) and gets no items.` });
      id = id + ' (2)';
    }
    const b = { ...(r as RawBooking), id, items: [] as RawItem[] };
    byId[id] = b;
    bookings.push(b);
  }
  for (const r of iRows) {
    const id = r.bookingId == null ? '' : String(r.bookingId).trim();
    if (!id) { warnings.push({ level: 'warn', text: `Items row ${r._row} has no Booking ID, so it was skipped.` }); continue; }
    if (!byId[id]) { warnings.push({ level: 'warn', text: `Items row ${r._row} (${r.sku || 'no SKU'}) refers to booking ${id}, which is not on the Bookings sheet.` }); continue; }
    byId[id].items.push(normalizeItem(r as RawItem));
  }
  return bookings.map(b => normalizeBooking(b));
}

/** Build bookings from already-mapped rows (used for the built-in sample). */
export function fromRows(bRows: Array<RawBooking & { _row: number }>, iRows: Array<RawItem & { _row: number }>): ReadResult {
  const warnings: ReadWarning[] = [];
  return { bookings: assemble(bRows as RowObject[], iRows as RowObject[], warnings), warnings, skippedExample: false };
}
