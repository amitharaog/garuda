/* Choose which documents to print: summary, invoice, packing list, export checklist, pallet and carton labels. */
import { useEffect, useRef, useState } from 'react';
import { ALL_PARTS, MAX_CARTON_LABELS, buildPrintPack, exportChecklist } from '../../io/print';
import type { PrintPart } from '../../io/print';
import type { CheckResult } from '../../domain';
import { openHtml, printHtml } from '../util';

const NAMES: Record<PrintPart, string> = {
  summary: 'Booking summary and next steps', invoice: 'Commercial invoice', packing: 'Packing list', checklist: 'Export checklist',
  pallets: 'Pallet labels (one per pallet)', cartons: 'Carton labels (one per carton)',
};

export function PrintModal({ result: r, reference, onClose }: { result: CheckResult; reference: string | null; onClose: () => void }) {
  const [parts, setParts] = useState<PrintPart[]>(ALL_PARTS);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);

  const b = r.booking;
  const cartons = r.totals.sumCartons || 0;
  const count: Partial<Record<PrintPart, string>> = {
    pallets: `${Math.floor(b.pallets || 0)} labels`,
    cartons: `${Math.min(cartons, MAX_CARTON_LABELS)} labels${cartons > MAX_CARTON_LABELS ? ` (first ${MAX_CARTON_LABELS} of ${cartons})` : ''}`,
  };
  const todo = exportChecklist(r).filter(c => c.state !== 'done').length;
  const html = () => buildPrintPack(r, reference, parts);
  const toggle = (p: PrintPart) => setParts(ps => (ps.includes(p) ? ps.filter(x => x !== p) : ALL_PARTS.filter(x => x === p || ps.includes(x))));

  return (
    <div className="modal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Print documents" tabIndex={-1} ref={sheet} style={{ maxWidth: 560 }}>
        <span className="eyebrow">{reference ? `Booking ${reference}` : `Draft · ${b.id}`}</span>
        <h2 style={{ fontSize: 26, margin: '4px 0 12px', textTransform: 'uppercase' }}>Print documents</h2>
        {!reference && <p className="needed" style={{ marginTop: 0 }}>This booking is not confirmed yet, so the documents are marked as a draft.</p>}
        <div className="print-parts">
          {ALL_PARTS.map(p => (
            <label key={p} className="print-part">
              <input type="checkbox" checked={parts.includes(p)} onChange={() => toggle(p)} />
              <span>{NAMES[p]}{count[p] && <span className="muted"> · {count[p]}</span>}{p === 'checklist' && todo > 0 && <span className="muted"> · {todo} to do</span>}</span>
            </label>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Labels carry Code 128 barcodes with the booking reference. In the print dialog, choose “Save as PDF” to keep a copy.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" disabled={!parts.length} onClick={() => openHtml(html())}>Open in a new tab</button>
          <button type="button" className="btn primary" disabled={!parts.length} onClick={() => { printHtml(html()); onClose(); }}>Print</button>
        </div>
      </div>
    </div>
  );
}
