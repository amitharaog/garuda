/* Printable document pack, built as one self-contained HTML page that the browser prints (or saves as PDF):
   booking summary, commercial invoice, packing list, export checklist, pallet labels and carton labels. */
import { confirmation, countryCode, invoiceRows, labelFields } from '../domain/confirmation';
import { fmtNum, kg, money } from '../domain/format';
import { niceDate, today } from '../domain/dates';
import type { CheckResult } from '../domain/types';
import { code128Svg } from './barcode';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export type PrintPart = 'summary' | 'invoice' | 'packing' | 'checklist' | 'pallets' | 'cartons';
export const ALL_PARTS: PrintPart[] = ['summary', 'invoice', 'packing', 'checklist', 'pallets', 'cartons'];
/** Carton labels are capped so a huge booking does not produce thousands of pages. */
export const MAX_CARTON_LABELS = 300;

export interface ChecklistItem {
  label: string;
  state: 'done' | 'missing' | 'todo';
  note: string;
}

/** What an export from the UK to the EU needs, ticked off from the booking where the data allows. */
export function exportChecklist(r: CheckResult): ChecklistItem[] {
  const has = (rule: string) => r.issues.some(i => i.rule === rule && (i.severity === 'Red' || i.severity === 'Amber'));
  const b = r.booking;
  return [
    { label: 'GB EORI number for the exporter', state: 'todo', note: 'Not in the booking data. Your customs broker needs it for the export declaration.' },
    { label: 'Commodity (HS) code on every line', state: has('R-01') ? 'missing' : 'done', note: has('R-01') ? 'At least one line is missing a 6-digit code (R-01).' : 'All lines have 6+ digit codes.' },
    { label: 'Country of origin on every line', state: has('R-09') ? 'missing' : 'done', note: has('R-09') ? 'At least one line has no origin (R-09).' : 'All lines have an origin.' },
    { label: 'Commercial invoice matches the declared value', state: has('R-02') ? 'missing' : 'done', note: has('R-02') ? 'Declared value and invoice lines differ by more than 1% (R-02).' : `Declared ${money(b.declaredValue)}.` },
    { label: 'Packing list matches cartons and units', state: has('R-03') || has('R-04') ? 'missing' : 'done', note: has('R-03') || has('R-04') ? 'Carton or unit counts do not add up (R-03 / R-04).' : `${fmtNum(b.cartons)} cartons, ${fmtNum(r.totals.units)} units.` },
    { label: 'No dangerous goods, or a DG service booked', state: has('R-06') ? 'missing' : 'done', note: has('R-06') ? 'A line looks like dangerous goods (R-06).' : 'No lithium batteries, aerosols or flammable liquids found.' },
    { label: 'Gross weight checked against the goods', state: has('R-07') ? 'missing' : 'done', note: has('R-07') ? 'Gross weight is below the goods alone (R-07).' : `${kg(b.grossWeight)} gross.` },
    { label: 'Pallets within the carrier weight limit', state: has('R-05') ? 'missing' : 'done', note: has('R-05') ? 'Too heavy per pallet for the carrier (R-05).' : r.rec.chosen ? `Within ${r.rec.chosen.c.maxKg} kg per pallet.` : '' },
    { label: 'Delivery appointment at the receiving site', state: b.destType !== 'Warehouse' ? 'done' : has('R-08') ? 'missing' : 'done', note: b.destType !== 'Warehouse' ? 'Business address: no slot needed.' : has('R-08') ? 'Warehouse slot not booked (R-08).' : 'Slot booked.' },
    { label: 'Incoterms agreed with the buyer', state: 'todo', note: 'Decides who pays EU import duty and VAT (e.g. DAP or DDP).' },
    { label: 'Export declaration lodged (CDS)', state: 'todo', note: 'Usually done by your customs broker or the carrier before collection.' },
  ];
}

function label(title: string, ref: string, lines: string[], code: string, cc: string): string {
  return `<section class="lbl"><div class="lbl-top"><div><div class="k">${esc(title)}</div><div class="ref">${esc(ref)}</div></div><div class="cc">${esc(cc)}</div></div>
    <div class="lbl-body">${lines.map(l => `<div>${esc(l)}</div>`).join('')}</div><div class="bc">${code128Svg(code, { height: 56, module: 1.5 })}<div class="bc-t">${esc(code)}</div></div></section>`;
}

export function buildPrintPack(r: CheckResult, reference: string | null, parts: PrintPart[] = ALL_PARTS): string {
  const b = r.booking, ch = r.rec.chosen, ref = reference || b.id, cc = countryCode(b.destCountry);
  const rows = invoiceRows(b);
  const tot = rows.reduce((s, x) => s + (x.total || 0), 0), net = rows.reduce((s, x) => s + (x.weight || 0), 0);
  const sections: string[] = [];
  const draft = reference ? '' : '<p class="warn">Draft: this booking is not confirmed yet.</p>';

  if (parts.includes('summary')) {
    const c = confirmation(r);
    sections.push(`<section class="page"><h1>Booking ${esc(ref)}</h1>${draft}<p>${esc(c.headline)}</p>
      <table class="kv">${labelFields(r).map(f => `<tr><th>${esc(f.k)}</th><td>${f.v.map(esc).join('<br>')}</td></tr>`).join('')}</table>
      <h2>What happens next</h2><ol>${c.next.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>`);
  }
  if (parts.includes('invoice')) {
    sections.push(`<section class="page"><h1>Commercial invoice</h1>${draft}
      <table class="kv"><tr><th>Invoice no.</th><td>INV-${esc(b.id)}</td><th>Date</th><td>${esc(niceDate(today()))}</td></tr>
      <tr><th>Exporter</th><td>${esc(b.seller)}<br>${esc(b.originCity)}, ${esc(b.originCountry)}</td><th>Consignee</th><td>${esc(b.destType)}<br>${esc(b.destCity)}, ${esc(b.destCountry)}</td></tr>
      <tr><th>Transport</th><td>${esc(ch ? ch.key : '—')} (road)</td><th>Currency</th><td>GBP</td></tr></table>
      <table class="grid"><thead><tr><th>SKU</th><th>Description</th><th>HS code</th><th>Origin</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Total</th><th class="n">Net kg</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td>${esc(x.sku)}</td><td>${esc(x.description)}</td><td>${x.hs ? esc(x.hs) : '<b class="bad">MISSING</b>'}</td><td>${x.origin ? esc(x.origin) : '<b class="bad">MISSING</b>'}</td><td class="n">${fmtNum(x.qty)}</td><td class="n">${money(x.unitPrice)}</td><td class="n">${money(x.total)}</td><td class="n">${fmtNum(x.weight)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="6">Total (GBP)${Math.abs(tot - (b.declaredValue || 0)) > 0.01 * tot ? ` <b class="bad">≠ declared ${money(b.declaredValue)}</b>` : ''}</td><td class="n">${money(tot)}</td><td class="n">${fmtNum(net)}</td></tr></tbody></table>
      <p class="small">Gross weight ${kg(b.grossWeight)} · ${fmtNum(b.pallets)} pallets · ${fmtNum(b.cartons)} cartons · Reason for export: sale of goods · Incoterms: to be agreed. Draft built from the booking; not a customs filing.</p>
      <p class="sign">Signature ____________________ &nbsp; Name ____________________ &nbsp; Date __________</p></section>`);
  }
  if (parts.includes('packing')) {
    let cartonNo = 1;
    sections.push(`<section class="page"><h1>Packing list</h1>${draft}<p>${esc(b.seller)} · ${esc(b.originCity)} → ${esc(b.destCity)}, ${esc(b.destCountry)} · Ref ${esc(ref)}</p>
      <table class="grid"><thead><tr><th>SKU</th><th>Description</th><th class="n">Cartons</th><th>Carton nos.</th><th class="n">Units / carton</th><th class="n">Units</th><th class="n">Net kg</th></tr></thead><tbody>
      ${b.items.map(it => { const n = it.cartons || 0; const from = cartonNo; cartonNo += n; return `<tr><td>${esc(it.sku)}</td><td>${esc(it.description)}</td><td class="n">${fmtNum(it.cartons)}</td><td>${n ? `${from}–${from + n - 1}` : '—'}</td><td class="n">${fmtNum(it.upc)}</td><td class="n">${fmtNum(it.qty)}</td><td class="n">${fmtNum(it.qty !== null && it.unitWeight !== null ? it.qty * it.unitWeight : null)}</td></tr>`; }).join('')}
      <tr class="tot"><td colspan="2">Totals</td><td class="n">${fmtNum(r.totals.sumCartons)}</td><td></td><td></td><td class="n">${fmtNum(r.totals.units)}</td><td class="n">${fmtNum(r.totals.net)}</td></tr></tbody></table>
      <p class="small">${fmtNum(b.pallets)} pallets · gross ${kg(b.grossWeight)}${b.cartons !== r.totals.sumCartons ? ` · <b class="bad">Booking says ${fmtNum(b.cartons)} cartons</b>` : ''}</p></section>`);
  }
  if (parts.includes('checklist')) {
    const mark = { done: '✓', missing: '✕', todo: '☐' } as const;
    sections.push(`<section class="page"><h1>Export checklist</h1><p>UK → ${esc(b.destCountry)} road export · Ref ${esc(ref)}</p>
      <table class="grid check"><tbody>${exportChecklist(r).map(c => `<tr class="${c.state}"><td class="m">${mark[c.state]}</td><td><b>${esc(c.label)}</b><br><span class="small">${esc(c.note)}</span></td></tr>`).join('')}</tbody></table>
      <p class="small">✓ checked from the booking · ✕ needs fixing · ☐ outside the booking data, do it yourself.</p></section>`);
  }
  if (parts.includes('pallets')) {
    const n = Math.max(0, Math.floor(b.pallets || 0));
    const labels = Array.from({ length: n }, (_, i) => label(`Pallet ${i + 1} of ${n}`, ref, [
      `From: ${b.seller}, ${b.originCity}`, `To: ${b.destType} · ${b.destCity}, ${b.destCountry}`, `Carrier: ${ch ? ch.key : '—'}`,
      `Gross ${kg(b.grossWeight && n ? b.grossWeight / n : null)} (approx.) · ${fmtNum(b.cartons)} cartons in total`,
    ], `${ref}-P${String(i + 1).padStart(2, '0')}`, cc));
    sections.push(`<section class="labels big"><h1 class="screen-only">Pallet labels</h1>${labels.join('')}</section>`);
  }
  if (parts.includes('cartons')) {
    const total = r.totals.sumCartons || 0;
    const labels: string[] = [];
    let no = 0;
    for (const it of b.items) {
      for (let k = 0; k < (it.cartons || 0) && labels.length < MAX_CARTON_LABELS; k++) {
        no++;
        labels.push(label(`Carton ${no} of ${total}`, ref, [`${it.sku} · ${it.description}`, `${fmtNum(it.upc)} units · HS ${it.hs || '—'} · ${it.origin || '—'}`, `To: ${b.destCity}, ${b.destCountry}`], `${ref}-C${String(no).padStart(4, '0')}`, cc));
      }
    }
    sections.push(`<section class="labels"><h1 class="screen-only">Carton labels</h1>${total > MAX_CARTON_LABELS ? `<p class="warn screen-only">Showing the first ${MAX_CARTON_LABELS} of ${total} carton labels.</p>` : ''}${labels.join('')}</section>`);
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Garuda documents · ${esc(ref)}</title><style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #05060b; margin: 0; padding: 16px; }
  h1 { font-size: 22px; margin: 0 0 8px; letter-spacing: -.02em; text-transform: uppercase; }
  h2 { font-size: 14px; margin: 16px 0 6px; text-transform: uppercase; }
  .page { break-after: page; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  .grid th, .grid td, .kv th, .kv td { border: 1px solid #c2c7de; padding: 5px 7px; text-align: left; vertical-align: top; }
  .grid th, .kv th { background: #eef0f9; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  .n { text-align: right !important; font-variant-numeric: tabular-nums; }
  .tot td { font-weight: 700; }
  .bad { color: #c42b2b; }
  .warn { color: #a86400; font-weight: 700; }
  .small { font-size: 10.5px; color: #545a78; }
  .sign { margin-top: 40px; }
  .check .m { width: 28px; font-size: 16px; text-align: center; }
  .check .missing .m { color: #c42b2b; } .check .done .m { color: #1f7a45; }
  .labels { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .labels.big { grid-template-columns: 1fr; }
  .labels h1, .labels .warn { grid-column: 1 / -1; }
  .lbl { border: 2px solid #05060b; border-radius: 4px; break-inside: avoid; }
  .labels.big .lbl { min-height: 120mm; font-size: 16px; break-after: page; }
  .lbl-top { display: flex; justify-content: space-between; border-bottom: 2px solid #05060b; }
  .lbl-top > div:first-child { padding: 6px 8px; }
  .lbl .k { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #545a78; }
  .lbl .ref { font-weight: 700; font-family: ui-monospace, Menlo, monospace; }
  .lbl .cc { font-size: 34px; font-weight: 900; padding: 4px 12px; border-left: 2px solid #05060b; display: flex; align-items: center; }
  .labels.big .cc { font-size: 72px; }
  .lbl-body { padding: 6px 8px; }
  .bc { padding: 4px 8px 8px; text-align: center; }
  .bc svg { max-width: 100%; height: auto; }
  .bc-t { font-family: ui-monospace, Menlo, monospace; font-size: 10px; letter-spacing: .1em; }
  @media print { body { padding: 0; } .screen-only { display: none; } }
  </style></head><body>${sections.join('\n')}</body></html>`;
}
