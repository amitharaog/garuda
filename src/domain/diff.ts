/* Before/after comparison of an uploaded file and the corrected one, cell by cell. */
import { BOOKING_FIELDS, ITEM_FIELDS } from './reference';
import type { Booking } from './types';

export interface CellChange {
  bookingId: string;
  /** "Bookings" or "Items". */
  sheet: 'Bookings' | 'Items';
  /** Spreadsheet row in the original file, when known. */
  row: number | null;
  sku: string;
  field: string;
  from: string;
  to: string;
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(blank)' : String(v));

export function diffBookings(before: Booking[], after: Booking[]): CellChange[] {
  const out: CellChange[] = [];
  const byId = new Map(before.map(b => [b.id, b]));
  for (const a of after) {
    const b = byId.get(a.id);
    if (!b) continue;
    for (const f of BOOKING_FIELDS) {
      const k = f.key as keyof Booking;
      if (show(b[k]) !== show(a[k])) out.push({ bookingId: a.id, sheet: 'Bookings', row: b._row ?? null, sku: '', field: f.label, from: show(b[k]), to: show(a[k]) });
    }
    // Items are matched by SKU, so a removed line shows as removed rather than shifting every row.
    const afterBySku = new Map(a.items.map(it => [it.sku, it]));
    for (const it of b.items) {
      const na = afterBySku.get(it.sku);
      if (!na) { out.push({ bookingId: a.id, sheet: 'Items', row: it._row ?? null, sku: it.sku, field: 'Line', from: it.description || it.sku, to: '(removed)' }); continue; }
      for (const f of ITEM_FIELDS) {
        if (f.key === 'bookingId') continue;
        const k = f.key as keyof typeof it;
        if (show(it[k]) !== show(na[k])) out.push({ bookingId: a.id, sheet: 'Items', row: it._row ?? null, sku: it.sku, field: f.label, from: show(it[k]), to: show(na[k]) });
      }
    }
  }
  return out;
}
