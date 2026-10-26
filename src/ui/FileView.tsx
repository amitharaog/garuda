/* Check a file: drop zone, summary counts, downloads, bookings table with filters, and the detail panel. */
import { useMemo, useRef, useState } from 'react';
import { countryCode, diffBookings, fileImpact, fmtDate, fmtNum, kg, money, safeFixes } from '../domain';
import type { Action, Booking, CheckResult, Status } from '../domain';
import type { ReadWarning } from '../io/assemble';
import { reportText } from '../io/report';
import { CarrierCards } from './components/carrier';
import { Checklist, IssuesWithNotes, StatusBar } from './components/results';
import { NextSteps, ShippingLabel } from './components/confirmation';
import { Alternatives, ImpactNote } from './components/extras';
import { copyText, downloadWorkbook } from './util';

export type Filter = 'All' | Status;

export interface FileState {
  bookings: Booking[];
  /** The bookings exactly as uploaded, for the before/after comparison. */
  original: Booking[];
  warnings: ReadWarning[];
  name: string;
  overrides: Record<string, string>;
  confirmed: Record<string, string>;
  filter: Filter;
  sel: string | null;
}

export interface FileActions {
  load: (files: File[]) => void;
  loadSample: () => void;
  select: (id: string) => void;
  filter: (f: Filter) => void;
  fix: (action: Action) => void;
  applyAlt: (actions: Action[], label: string) => void;
  fixAllSafe: () => void;
  confirm: () => void;
  fixInChat: (id: string) => void;
  invoice: () => void;
  print: () => void;
  share: () => void;
}

function RuleChips({ r }: { r: CheckResult }) {
  const seen = new Set<string>();
  const chips = r.issues.filter(i => ['Red', 'Amber', 'Notice'].includes(i.severity)).filter(i => {
    const k = i.rule + i.severity;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!chips.length) return <span className="muted">none</span>;
  return <div className="rulechips">{chips.map(i => <span key={i.rule + i.severity} className={`rc ${i.severity}`} title={i.title}>{i.rule}</span>)}</div>;
}

function Detail({ fs, r, act }: { fs: FileState; r: CheckResult; act: FileActions }) {
  const b = r.booking;
  const ref = fs.confirmed[b.id] || null;
  return (
    <div className="detail" data-testid="booking-detail">
      <div className="detail-head">
        <div>
          <span className="eyebrow">Row {b._row ?? '—'} · {b.seller}</span>
          <h2><span className="mono" style={{ fontFamily: 'var(--f-mono)' }}>{b.id}</span> · {b.originCity} → {b.destCity}, {b.destCountry}</h2>
          <div className="muted" style={{ fontSize: 14 }}>
            {b.destType} · ready {b.readyDate} · {b.priority} · {fmtNum(b.pallets)} pallets · {fmtNum(b.cartons)} cartons · {kg(b.grossWeight)} · {money(b.declaredValue)} · appointment {b.appointment || '—'}
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => act.fixInChat(b.id)}>Fix in chat</button>
          <button type="button" className="btn" onClick={act.invoice}>Invoice draft</button>
          <button type="button" className="btn" onClick={act.print}>Print documents</button>
          <button type="button" className="btn" onClick={act.share} title="Copy a link that opens this booking">Share link</button>
        </div>
      </div>
      <div className="col">
        <div><StatusBar r={r} /><ImpactNote r={r} /></div>
        <div>
          <div className="section-title"><h3>What's wrong &amp; how to fix it</h3></div>
          <IssuesWithNotes r={r} onFix={act.fix} />
        </div>
        <div>
          <div className="section-title"><h3>Items</h3></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>SKU</th><th>Description</th><th>HS</th><th className="n">Qty</th><th className="n">Unit £</th><th className="n">Per ctn</th><th className="n">Ctns</th><th className="n">Unit kg</th><th>Origin</th></tr></thead>
              <tbody>
                {b.items.map((it, i) => (
                  <tr key={i}>
                    <td className="mono">{it.sku}</td><td>{it.description}</td>
                    <td className="mono">{it.hs || <span className="sev-red">—</span>}</td>
                    <td className="n">{fmtNum(it.qty)}</td><td className="n">{money(it.unitPrice)}</td><td className="n">{fmtNum(it.upc)}</td>
                    <td className="n">{fmtNum(it.cartons)}</td><td className="n">{fmtNum(it.unitWeight, 3)}</td>
                    <td>{it.origin || <span className="sev-amber">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <details className="more"><summary>All 10 rules</summary><div style={{ marginTop: 8 }}><Checklist r={r} /></div></details>
      </div>
      <div className="col">
        <div><div className="section-title"><h3>Recommended carrier</h3></div><CarrierCards r={r} onCarrier={key => act.fix({ type: 'carrier', value: key, label: key ? `Carrier → ${key}` : 'Recommended carrier' })} />
          <Alternatives booking={b} carrierOverride={fs.overrides[b.id]} onApply={act.applyAlt} /></div>
        <div>
          <div className="section-title"><h3>Confirmation</h3></div>
          <ShippingLabel r={r} reference={ref} />
          <div style={{ marginTop: 12 }}><NextSteps r={r} /></div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary" onClick={act.confirm} disabled={r.status === 'Red'} title={r.status === 'Red' ? 'Fix the red issues first' : undefined}>
              {ref ? 'Confirmed ✓' : 'Confirm booking'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FileView({ fs, results, act }: { fs: FileState; results: CheckResult[]; act: FileActions }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const n = (s: Status) => results.filter(r => r.status === s).length;
  const cost = results.reduce((s, r) => s + (r.rec.chosen?.cost || 0), 0);
  const rows = results.filter(r => fs.filter === 'All' || r.status === fs.filter);
  const sel = results.find(r => r.booking.id === fs.sel) || null;
  const impact = useMemo(() => fileImpact(results), [results]);
  const safeCount = useMemo(() => results.reduce((s, r) => s + safeFixes(r).length, 0), [results]);
  const changes = useMemo(() => diffBookings(fs.original, fs.bookings), [fs.original, fs.bookings]);
  const select = (id: string) => {
    act.select(id);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <>
      <div className="file-top">
        <div
          className={`drop ${over ? 'over' : ''}`}
          onDragEnter={e => { e.preventDefault(); setOver(true); }}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={e => { e.preventDefault(); setOver(false); }}
          onDrop={e => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) act.load([...e.dataTransfer.files]); }}
        >
          <span className="eyebrow">Sheets 1 &amp; 2 · Bookings + Items</span>
          <h2>Check every booking in a file</h2>
          <p>Upload the template workbook (.xlsx) with the Bookings and Items sheets filled in, or two CSVs. Each booking is checked against all 10 rules, gets a carrier recommendation, and a confirmation.</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => inputRef.current?.click()}>Choose file…</button>
            <input
              ref={inputRef} type="file" accept=".xlsx,.xls,.csv" multiple hidden data-testid="file-input"
              onChange={e => { const f = e.currentTarget.files; if (f && f.length) act.load([...f]); e.currentTarget.value = ''; }}
            />
            <button type="button" className="btn" onClick={act.loadSample} title="9 bookings with planted mistakes">Use the sample file</button>
            <a className="btn" href="/Preflight_Sample_Test_Data.xlsx" download>Download sample file</a>
          </div>
          <p style={{ fontSize: 13 }}>
            Or drop the file here. Files are read in your browser; nothing is uploaded to a server.{' '}
            The sample has 9 bookings with planted mistakes. Starting your own? Get the{' '}
            <a className="link" href="/Case2_Shipment_Booking_Test_Data_Format.xlsx" download>blank template</a>.
          </p>
        </div>
        <div className="panel" id="file-summary" data-testid="file-summary">
          {results.length ? (
            <>
              <div className="sum-head"><span className="eyebrow">Results</span><div className="sum-file">{fs.name}</div></div>
              <div className="stats">
                <div className="stat"><div className="v">{results.length}</div><div className="muted">bookings</div></div>
                <div className="stat r"><div className="v">{n('Red')}</div><div className="muted">on hold</div></div>
                <div className="stat a"><div className="v">{n('Amber')}</div><div className="muted">warnings</div></div>
                <div className="stat g"><div className="v">{n('Green')}</div><div className="muted">ready</div></div>
              </div>
              <div className="sum-foot">
                <span className="muted">Freight at recommended carriers: <b className="num">{money(cost)}</b></span>
                {impact.cost > 0 && <span className="impact-line" data-testid="file-impact">Catching these issues avoids roughly <b>{money(impact.cost)}</b> in extra costs and <b>{impact.days}</b> booking-days of delay <span className="muted">(estimate)</span></span>}
                <button type="button" className="btn primary small fix-all" onClick={act.fixAllSafe} disabled={!safeCount} title="Declared values, carton totals and dropped leading zeros: fixes with only one right answer">
                  ✓ Fix all safe issues{safeCount ? ` (${safeCount})` : ''}
                </button>
                <div className="row">
                  <button type="button" className="btn small" onClick={() => downloadWorkbook(w => w.reportWorkbook(results), 'garuda-issues-report.xlsx')}>Download issues report</button>
                  <button type="button" className="btn small" onClick={() => downloadWorkbook(w => w.bookingsWorkbook(fs.bookings, changes), 'garuda-corrected-bookings.xlsx')}>Download corrected file</button>
                  <button type="button" className="btn small" onClick={() => copyText(reportText(results))}>Copy report</button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty"><b>{fs.name ? `No bookings found in ${fs.name}.` : 'No file checked yet.'}</b><br />Upload the template with your bookings, or load the sample to see how mistakes are caught.</div>
          )}
        </div>
      </div>

      {fs.warnings.length > 0 && (
        <div className="panel warnings" data-testid="file-warnings">
          <span className="eyebrow">Reading the file</span>
          <ul>{fs.warnings.map((w, i) => <li key={i} className={w.level === 'warn' ? 'sev-amber' : 'muted'} style={{ fontWeight: 400 }}>{w.text}</li>)}</ul>
        </div>
      )}

      {changes.length > 0 && (
        <details className="panel changes" data-testid="changes">
          <summary><b>{changes.length} change{changes.length > 1 ? 's' : ''} since upload</b> <span className="muted">· included as a “Changes” sheet in the corrected file</span></summary>
          <div className="tbl-wrap" style={{ margin: '10px 0 0' }}>
            <table>
              <thead><tr><th>Booking</th><th>Sheet</th><th className="n">Row</th><th>SKU</th><th>Field</th><th>Was</th><th>Now</th></tr></thead>
              <tbody>
                {changes.map((c, i) => (
                  <tr key={i}><td className="mono">{c.bookingId}</td><td>{c.sheet}</td><td className="n">{c.row ?? '—'}</td><td className="mono">{c.sku || '—'}</td><td>{c.field}</td><td className="was">{c.from}</td><td className="now">{c.to}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {results.length > 0 && (
        <div className="dash">
          <div className="panel">
            <div className="section-title" style={{ padding: '14px 16px 0' }}>
              <h3>Bookings</h3>
              <div className="filters" role="group" aria-label="Filter by status">
                {(['All', 'Red', 'Amber', 'Green'] as Filter[]).map(f => (
                  <button type="button" key={f} aria-pressed={fs.filter === f} onClick={() => act.filter(f)}>{f}{f === 'All' ? '' : ' ' + n(f)}</button>
                ))}
              </div>
            </div>
            <div className="tbl-wrap" style={{ margin: '10px 16px 16px' }}>
              <table className="btable" data-testid="bookings-table">
                <thead><tr><th>Booking</th><th>Seller</th><th>Route</th><th>Status</th><th>Problems</th><th>Priority</th><th>Carrier</th><th className="n">Cost</th><th>Ready → ETA</th></tr></thead>
                <tbody>
                  {rows.map(r => {
                    const b = r.booking, ch = r.rec.chosen;
                    return (
                      <tr key={b.id} data-id={b.id} className={fs.sel === b.id ? 'sel' : ''} tabIndex={0} aria-selected={fs.sel === b.id}
                        onClick={() => select(b.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(b.id); } }}>
                        <td className="mono"><b>{b.id}</b>{fs.confirmed[b.id] && <><br /><span className="tag">booked</span></>}</td>
                        <td>{b.seller}</td>
                        <td>{b.originCity} → {b.destCity} <span className="tag">{countryCode(b.destCountry)}</span></td>
                        <td><span className={`pill ${r.status}`}>{r.status}</span></td>
                        <td className="issues-cell"><RuleChips r={r} /></td>
                        <td>{b.priority}</td>
                        <td>{ch ? <>{ch.c.carrier}<br /><span className="muted">{ch.c.service}</span></> : '—'}</td>
                        <td className="n">{ch ? money(ch.cost) : '—'}</td>
                        <td className="num" style={{ whiteSpace: 'nowrap' }}>{b.readyDate}<br /><span className="muted">{r.eta ? fmtDate(r.eta) : '—'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel" id="detail" ref={detailRef}>
            {sel ? <Detail fs={fs} r={sel} act={act} /> : <div className="empty">Select a booking to see what is wrong, how to fix it, and the carrier recommendation.</div>}
          </div>
        </div>
      )}
    </>
  );
}
