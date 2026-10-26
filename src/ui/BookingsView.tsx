/* My bookings: every booking confirmed in this browser, newest first, with search, a destination filter and
   per-booking actions (open in chat, print documents, invoice draft, share link, remove). */
import { useMemo, useState } from 'react';
import { countryCode, money, plural } from '../domain';
import type { SavedBooking } from '../io/history';

export interface BookingsActions {
  open: (e: SavedBooking) => void;
  print: (e: SavedBooking) => void;
  invoice: (e: SavedBooking) => void;
  share: (e: SavedBooking) => void;
  remove: (ref: string) => void;
  newBooking: () => void;
  checkFile: () => void;
}

const DESTS = ['All', 'Germany', 'France', 'Netherlands'] as const;
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const isoDay = (iso: string | null) => (iso ? day(new Date(iso + 'T12:00:00').getTime()) : '—');

export function BookingsView({ history, act }: { history: SavedBooking[]; act: BookingsActions }) {
  const [q, setQ] = useState('');
  const [dest, setDest] = useState<(typeof DESTS)[number]>('All');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return history.filter(e => {
      const b = e.booking;
      if (dest !== 'All' && b.destCountry !== dest) return false;
      if (!needle) return true;
      return [e.ref, b.id, b.seller, b.originCity, b.destCity, b.destCountry, e.carrier || ''].some(v => String(v || '').toLowerCase().includes(needle));
    });
  }, [history, q, dest]);

  if (!history.length)
    return (
      <div className="panel bookings-empty" data-testid="bookings-empty">
        <span className="eyebrow">My bookings</span>
        <h2>No bookings yet</h2>
        <p>Bookings you confirm, in chat or from a file, are kept here in this browser, with their carrier, price and documents.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={act.newBooking}>Book a shipment</button>
          <button type="button" className="btn" onClick={act.checkFile}>Check a file</button>
        </div>
      </div>
    );

  const freight = history.reduce((s, e) => s + (e.cost || 0), 0);
  const pallets = history.reduce((s, e) => s + (e.booking.pallets || 0), 0);
  const lanes = new Set(history.map(e => `${e.booking.originCity}→${e.booking.destCity}`)).size;

  return (
    <div className="bookings" data-testid="bookings">
      <div className="kpis">
        <div className="panel kpi"><span className="eyebrow">Bookings</span><b>{history.length}</b><span className="muted">confirmed in this browser</span></div>
        <div className="panel kpi accent"><span className="eyebrow">Freight booked</span><b>{money(freight)}</b><span className="muted">at the agreed carriers</span></div>
        <div className="panel kpi"><span className="eyebrow">Pallets</span><b>{pallets}</b><span className="muted">across all bookings</span></div>
        <div className="panel kpi"><span className="eyebrow">Lanes</span><b>{lanes}</b><span className="muted">{plural(lanes, 'route')} used</span></div>
      </div>

      <div className="panel">
        <div className="bookings-bar">
          <input type="search" className="bookings-search" placeholder="Search by reference, seller, city or carrier" aria-label="Search bookings" value={q} onChange={e => setQ(e.target.value)} />
          <div className="filters" role="group" aria-label="Filter by destination">
            {DESTS.map(d => (
              <button key={d} type="button" aria-pressed={dest === d} onClick={() => setDest(d)}>
                {d === 'All' ? 'All' : countryCode(d)}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="empty">No bookings match “{q}”{dest !== 'All' ? ` to ${dest}` : ''}.</div>
        ) : (
          <div className="tbl-wrap bookings-tbl">
            <table data-testid="bookings-history">
              <thead>
                <tr><th>Reference</th><th>Seller</th><th>Route</th><th>Ready</th><th className="n">Pallets</th><th>Carrier</th><th className="n">Cost</th><th>ETA</th><th>Confirmed</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {rows.map(e => {
                  const b = e.booking;
                  return (
                    <tr key={e.ref} data-ref={e.ref}>
                      <td className="mono"><b>{e.ref}</b><small className="muted">{b.id} · {e.source === 'file' ? 'from file' : 'by chat'}</small></td>
                      <td>{b.seller || '—'}</td>
                      <td>{b.originCity} → {b.destCity} <span className="tag">{countryCode(b.destCountry)}</span></td>
                      <td className="mono">{b.readyDate || '—'}</td>
                      <td className="n">{b.pallets ?? '—'}</td>
                      <td>{e.carrier || '—'}</td>
                      <td className="n"><b>{e.cost !== null ? money(e.cost) : '—'}</b></td>
                      <td>{isoDay(e.eta)}</td>
                      <td>{day(e.confirmedAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn small" onClick={() => act.open(e)}>Open</button>
                          <button type="button" className="btn small" onClick={() => act.print(e)}>Documents</button>
                          <button type="button" className="btn small" onClick={() => act.invoice(e)}>Invoice</button>
                          <button type="button" className="btn small" onClick={() => act.share(e)}>Share</button>
                          {confirmRemove === e.ref
                            ? <button type="button" className="btn small danger" onClick={() => { act.remove(e.ref); setConfirmRemove(null); }}>Confirm remove</button>
                            : <button type="button" className="btn small" aria-label={`Remove ${e.ref}`} onClick={() => setConfirmRemove(e.ref)}>Remove</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="footer-note bookings-note">Kept only in this browser. Clearing site data removes them.</p>
      </div>
    </div>
  );
}
