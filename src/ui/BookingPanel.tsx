/* The live booking panel: 4-step tracker, "Still needed", editable fields and items, checks, carrier and confirmation. */
import type { CSSProperties, ReactNode } from 'react';
import { ALLOWED, CITY_TO_COUNTRY, num, parseDate, fmtDate } from '../domain';
import type { CheckResult } from '../domain';
import { parseDateText } from '../chat/understand';
import type { Conversation } from '../chat/conversation';
import type { ChatActions } from './ChatView';
import { CarrierCards } from './components/carrier';
import { Checklist, IssuesWithNotes, StatusBar } from './components/results';
import { NextSteps, ShippingLabel, Stepper } from './components/confirmation';
import { Alternatives, ImpactNote } from './components/extras';
import { toast } from './util';

const NUM_FIELDS = ['pallets', 'cartons', 'declaredValue', 'grossWeight', 'qty', 'unitPrice', 'upc', 'unitWeight'];

/** Turn what was typed in a cell into a value for the conversation, or undefined if it is not valid. */
function cellValue(field: string, raw: string): string | number | null | undefined {
  const v = raw.trim();
  if (NUM_FIELDS.includes(field)) {
    if (v === '') return null;
    const n = num(v);
    return n === null ? undefined : n;
  }
  if (field === 'readyDate' && v && !parseDate(v)) {
    const d = parseDateText(v);
    return d ? fmtDate(d.date) : v;
  }
  return v;
}

type FieldProps = { id: string; label: string; field: string; value: unknown; missing: boolean; derived?: boolean; version: number; act: ChatActions; item?: number };

/** A text cell that commits on blur or Enter (not on every keystroke). */
function Cell({ id, field, value, version, act, item, label, style }: Omit<FieldProps, 'missing' | 'derived'> & { style?: CSSProperties }) {
  const shown = value === null || value === undefined ? '' : String(value);
  const commit = (el: HTMLInputElement) => {
    if (el.value === shown) return;
    const v = cellValue(field, el.value);
    if (v === undefined) { toast('Please enter a number'); el.value = shown; return; }
    if (field === 'description' && v === '') { toast('Every line needs a product name; use ✕ to remove the line'); el.value = shown; return; }
    act.edit(field, v, item);
  };
  return (
    <input
      id={id} key={`${id}-${version}`} defaultValue={shown} aria-label={label} style={style}
      inputMode={NUM_FIELDS.includes(field) ? 'decimal' : undefined}
      placeholder={field === 'readyDate' ? 'DD-MM-YYYY' : undefined}
      onBlur={e => commit(e.currentTarget)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget); } }}
    />
  );
}

function Select({ id, field, value, options, act, item, label }: { id: string; field: string; value: string; options: readonly string[]; act: ChatActions; item?: number; label: string }) {
  const opts = value && !options.includes(value) ? [...options, value] : options;
  return (
    <select id={id} value={value || ''} aria-label={label} onChange={e => act.edit(field, e.target.value, item)}>
      <option value="">—</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Field({ label, missing, derived, children }: { label: string; missing: boolean; derived?: boolean; children: ReactNode }) {
  return (
    <div className={`field ${missing ? 'missing' : ''}`}>
      <label>{label}{derived && <> <span className="derived">· auto</span></>}</label>
      {children}
    </div>
  );
}

function flagged(r: CheckResult, i: number, k: string): string {
  const bad = r.issues.find(x => x.itemIndex === i && (
    (k === 'hs' && x.rule === 'R-01') || (k === 'origin' && x.rule === 'R-09') ||
    (['qty', 'upc', 'cartons'].includes(k) && x.rule === 'R-03') || (k === 'description' && x.rule === 'R-06')));
  return bad ? (bad.severity === 'Red' ? 'bad' : 'warn') : '';
}

const ITEM_COLS: Array<[string, string, number]> = [
  ['sku', 'SKU', 90], ['description', 'Description', 180], ['hs', 'HS code', 90], ['qty', 'Qty', 70], ['unitPrice', 'Unit £', 70],
  ['upc', 'Per ctn', 60], ['cartons', 'Cartons', 60], ['unitWeight', 'Unit kg', 60],
];

export function BookingPanel({ conv, act, version }: { conv: Conversation; act: ChatActions; version: number }) {
  const b = conv.b;
  const done = conv.isComplete();
  const r = conv.result();
  const missing = done ? [] : conv.missingList();
  const started = conv.history.length > 0 || conv.mode === 'file';
  const cities = b.destCountry ? ALLOWED.destCities[b.destCountry] || Object.keys(CITY_TO_COUNTRY) : Object.keys(CITY_TO_COUNTRY);
  const detailsDone = !!(b.seller && b.originCity && b.destCity && b.destType && b.readyDate && b.priority && b.pallets !== null && b.grossWeight !== null && (b.destType !== 'Warehouse' || b.appointment));
  const productsDone = b.items.length > 0 && conv.itemsDone && b.items.every(it => it.description && it.qty !== null && it.unitPrice !== null && it.upc !== null && it.cartons !== null && it.unitWeight !== null);
  const fp = { version, act };

  return (
    <div className={`panel manifest ${started ? 'started' : ''}`} data-testid="booking-panel">
      <div className="manifest-head">
        <div>
          <span className="eyebrow">Live booking{conv.loadedFrom === 'link' ? ' · from a shared link' : conv.loadedFrom === 'history' ? ' · from your bookings' : conv.mode === 'file' ? ' · from your file' : ''}</span>
          <h2 className="mono" style={{ fontFamily: 'var(--f-mono)', fontSize: 18 }}>{b.id}</h2>
        </div>
        <div className="row">
          {done ? <span className={`pill ${r.status}`} data-testid="status-pill">{r.status}</span> : <span className="pill Draft" data-testid="status-pill">Draft</span>}
          {conv.confirmed && <span className="tag">Confirmed {conv.confirmed}</span>}
        </div>
      </div>
      <Stepper steps={[['Shipment', detailsDone], ['Products', productsDone], ['Checks', done && r.status !== 'Red'], ['Confirm', !!conv.confirmed]]} />
      {missing.length > 0 && <div className="needed" data-testid="still-needed"><b>Still needed:</b> {missing.join(' · ')}</div>}

      <div className="section-title"><h3>Shipment details</h3></div>
      <div className="fields">
        <Field label="Seller name" missing={!b.seller}><Cell id="f-seller" label="Seller name" field="seller" value={b.seller} {...fp} /></Field>
        <Field label="Origin city" missing={!b.originCity}><Select id="f-ocity" label="Origin city" field="originCity" value={b.originCity} options={ALLOWED.originCity} act={act} /></Field>
        <Field label="Destination city" missing={!b.destCity}><Select id="f-dcity" label="Destination city" field="destCity" value={b.destCity} options={cities} act={act} /></Field>
        <Field label="Dest. country" missing={!b.destCountry}><Select id="f-dctry" label="Destination country" field="destCountry" value={b.destCountry} options={ALLOWED.destCountry} act={act} /></Field>
        <Field label="Destination type" missing={!b.destType}><Select id="f-dtype" label="Destination type" field="destType" value={b.destType} options={ALLOWED.destType} act={act} /></Field>
        <Field label="Ready to ship" missing={!b.readyDate}><Cell id="f-ready" label="Ready to ship date" field="readyDate" value={b.readyDate} {...fp} /></Field>
        <Field label="Priority" missing={!b.priority}><Select id="f-prio" label="Priority" field="priority" value={b.priority} options={ALLOWED.priority} act={act} /></Field>
        <Field label="Appointment booked" missing={b.destType === 'Warehouse' && !b.appointment}><Select id="f-appt" label="Appointment booked" field="appointment" value={b.appointment} options={ALLOWED.yesNo} act={act} /></Field>
        <Field label="Pallets" missing={b.pallets === null}><Cell id="f-pal" label="Pallets" field="pallets" value={b.pallets} {...fp} /></Field>
        <Field label="Cartons" missing={b.cartons === null} derived={!conv.stated.cartons && b.cartons !== null}><Cell id="f-ctn" label="Cartons" field="cartons" value={b.cartons} {...fp} /></Field>
        <Field label="Declared value £" missing={b.declaredValue === null} derived={!conv.stated.declaredValue && b.declaredValue !== null}><Cell id="f-val" label="Declared value" field="declaredValue" value={b.declaredValue} {...fp} /></Field>
        <Field label="Gross weight kg" missing={b.grossWeight === null}><Cell id="f-gw" label="Gross weight" field="grossWeight" value={b.grossWeight} {...fp} /></Field>
      </div>

      <div>
        <div className="section-title"><h3>Items</h3><button type="button" className="btn small" onClick={act.addItem}>+ Add product</button></div>
        {b.items.length ? (
          <div className="tbl-wrap">
            <table className="items-tbl">
              <thead>
                <tr>{ITEM_COLS.map(([k, l]) => <th key={k} className={['sku', 'description', 'hs'].includes(k) ? '' : 'n'}>{l}</th>)}<th>Origin</th><th><span className="sr-only">Remove</span></th></tr>
              </thead>
              <tbody>
                {b.items.map((it, i) => (
                  <tr key={i}>
                    {ITEM_COLS.map(([k, l, w]) => (
                      <td key={k} className={flagged(r, i, k)}>
                        <Cell id={`it-${i}-${k}`} label={`${l}, item ${i + 1}`} field={k} value={(it as unknown as Record<string, unknown>)[k]} item={i} style={{ minWidth: w }} {...fp} />
                      </td>
                    ))}
                    <td className={flagged(r, i, 'origin')}><Select id={`it-${i}-origin`} label={`Origin, item ${i + 1}`} field="origin" value={it.origin} options={ALLOWED.itemOrigin} act={act} item={i} /></td>
                    <td><button type="button" className="btn small" aria-label={`Remove item ${i + 1}`} onClick={() => act.removeItem(i)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted" style={{ margin: 0, fontSize: 14 }}>No products yet. Describe them in the chat.</p>}
      </div>

      {done ? (
        <>
          <div>
            <div className="section-title"><h3>Pre-flight checks</h3><button type="button" className="btn small" onClick={act.invoice}>Invoice draft</button></div>
            <StatusBar r={r} />
            <ImpactNote r={r} />
            <div style={{ marginTop: 10 }}><IssuesWithNotes r={r} onFix={act.fix} /></div>
            <details className="more" open><summary>All 10 rules</summary><div style={{ marginTop: 8 }}><Checklist r={r} /></div></details>
          </div>
          <div><div className="section-title"><h3>Carrier</h3></div><CarrierCards r={r} onCarrier={act.carrier} /><Alternatives booking={r.booking} carrierOverride={conv.carrierOverride} onApply={act.applyAlt} /></div>
          <div>
            <div className="section-title"><h3>Confirmation</h3></div>
            <ShippingLabel r={r} reference={conv.confirmed} />
            <div style={{ marginTop: 12 }}><NextSteps r={r} /></div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary" onClick={() => act.send('confirm')} disabled={r.status === 'Red'} title={r.status === 'Red' ? 'Fix the red issues first' : undefined}>
                {conv.confirmed ? 'Confirmed ✓' : 'Confirm booking'}
              </button>
              <button type="button" className="btn" onClick={act.print}>Print documents</button>
              <button type="button" className="btn" onClick={act.share} title="Copy a link that opens this booking">Share link</button>
              {act.backToFile && <button type="button" className="btn" onClick={act.backToFile}>Back to file results</button>}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            Checks, carrier recommendation and confirmation appear here as soon as the booking is complete.{b.items.length || b.destCountry ? ' Partial checks so far:' : ''}
          </div>
          {b.items.length > 0 && <Checklist r={r} />}
        </>
      )}
    </div>
  );
}
