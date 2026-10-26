/* Write the corrected bookings file (same columns as the template) and the issues report. */
import * as XLSX from 'xlsx';
import { fmtDate } from '../domain/dates';
import type { Booking, CheckResult } from '../domain/types';

export const B_HEAD = ['Booking ID', 'Seller name', 'Origin city', 'Origin country', 'Destination city', 'Destination country', 'Destination type', 'Ready to ship date', 'Seller priority', 'Pallets', 'Cartons', 'Total declared value', 'Currency', 'Total gross weight (kg)', 'Delivery appointment booked'];
export const I_HEAD = ['Booking ID', 'SKU', 'Description', 'HS code', 'Quantity (units)', 'Unit price', 'Units per carton', 'Cartons', 'Unit weight (kg)', 'Country of origin'];

/** HS codes go out as numbers like the template, except when a leading zero must survive. */
const hsCell = (hs: string): string | number | null => (hs === '' ? null : /^\d+$/.test(hs) && !hs.startsWith('0') ? Number(hs) : hs);

export function bookingsWorkbook(bookings: Booking[]): XLSX.WorkBook {
  const bRows: unknown[][] = [['Bookings: corrected by Pre-Flight. Same columns as the template.'], B_HEAD];
  const iRows: unknown[][] = [['Items: corrected by Pre-Flight. Same columns as the template.'], I_HEAD];
  for (const b of bookings) {
    bRows.push([b.id, b.seller, b.originCity, b.originCountry, b.destCity, b.destCountry, b.destType, b.readyDate, b.priority, b.pallets, b.cartons, b.declaredValue, b.currency, b.grossWeight, b.appointment]);
    for (const it of b.items) iRows.push([b.id, it.sku, it.description, hsCell(it.hs), it.qty, it.unitPrice, it.upc, it.cartons, it.unitWeight, it.origin || null]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bRows), 'Bookings');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(iRows), 'Items');
  return wb;
}

export function reportWorkbook(results: CheckResult[]): XLSX.WorkBook {
  const sum: unknown[][] = [['Booking ID', 'Seller', 'Route', 'Status', 'Red issues', 'Amber warnings', 'Recommended carrier', 'Carrier cost (GBP)', 'Ready date', 'Estimated delivery', 'Why this carrier']];
  const iss: unknown[][] = [['Booking ID', 'Rule', 'Severity', 'Extra check', 'Problem', "What's wrong", 'How to fix']];
  for (const r of results) {
    const b = r.booking, ch = r.rec.chosen;
    sum.push([b.id, b.seller, `${b.originCity} → ${b.destCity}, ${b.destCountry}`, r.status, r.red, r.amber, ch ? ch.key : '', ch ? ch.cost : '', b.readyDate, r.eta ? fmtDate(r.eta) : '',
      r.rec.reason + (r.rec.notes.length ? ' ' + r.rec.notes.map(n => n.text).join(' ') : '')]);
    for (const i of r.issues) iss.push([b.id, i.rule, i.severity, i.extra ? 'Yes' : '', i.title, i.what, i.fix]);
    if (!r.issues.length) iss.push([b.id, '—', 'Green', '', 'No issues', 'All 10 rulebook checks passed.', '—']);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(iss), 'Issues');
  return wb;
}

export const workbookBytes = (wb: XLSX.WorkBook): Uint8Array => new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
