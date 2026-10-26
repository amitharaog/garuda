/* Commercial invoice draft, with missing HS codes and origins highlighted. */
import { useEffect, useRef } from 'react';
import { fmtNum, invoiceRows, invoiceText, kg, money, niceDate, today } from '../../domain';
import type { Booking, CheckResult } from '../../domain';
import { copyText } from '../util';

export function InvoiceModal({ booking: b, result: r, onClose }: { booking: Booking; result: CheckResult; onClose: () => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);

  const rows = invoiceRows(b);
  const tot = rows.reduce((s, x) => s + (x.total || 0), 0), net = rows.reduce((s, x) => s + (x.weight || 0), 0);
  const miss = (v: string) => v || <span className="sev-red">MISSING</span>;
  const mismatch = Math.abs(tot - (b.declaredValue || 0)) > 0.01 * tot;
  return (
    <div className="modal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet invoice" role="dialog" aria-modal="true" aria-label="Commercial invoice draft" tabIndex={-1} ref={sheet}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><span className="eyebrow">Draft generated from the booking</span><h2>Commercial invoice</h2></div>
          <div className="row">
            <button type="button" className="btn small" onClick={() => copyText(invoiceText(b, r.rec.chosen?.key ?? null))}>Copy as text</button>
            <button type="button" className="btn small" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="inv-parties">
          <div><div className="eyebrow">Invoice no. / date</div><b className="mono">INV-{b.id}</b><br />{niceDate(today())}</div>
          <div><div className="eyebrow">Exporter (seller)</div><b>{b.seller}</b><br />{b.originCity}, {b.originCountry}</div>
          <div><div className="eyebrow">Consignee</div><b>{b.destType}</b><br />{b.destCity}, {b.destCountry}</div>
          <div><div className="eyebrow">Transport</div>{r.rec.chosen ? r.rec.chosen.key : '—'}<br />Road · {fmtNum(b.pallets)} pallets · {fmtNum(b.cartons)} cartons</div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>SKU</th><th>Description</th><th>HS code</th><th>Origin</th><th className="n">Qty</th><th className="n">Unit</th><th className="n">Total</th><th className="n">Net kg</th></tr></thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={i}>
                  <td className="mono">{x.sku}</td><td>{x.description}</td><td className="mono">{miss(x.hs)}</td><td>{miss(x.origin)}</td>
                  <td className="n">{fmtNum(x.qty)}</td><td className="n">{money(x.unitPrice)}</td><td className="n">{money(x.total)}</td><td className="n">{fmtNum(x.weight)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={6}><b>Total (GBP)</b>{mismatch && <> <span className="sev-red">≠ declared {money(b.declaredValue)}</span></>}</td>
                <td className="n"><b>{money(tot)}</b></td><td className="n"><b>{fmtNum(net)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Gross weight {kg(b.grossWeight)} · Reason for export: sale of goods · Incoterms: to be agreed with the buyer. This draft is built from the booking data; it is not a customs filing.</p>
      </div>
    </div>
  );
}
