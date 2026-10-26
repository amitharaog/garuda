/* Booking history: every confirmed booking, kept only in this browser (localStorage), newest first.
   Stores the booking itself plus what was agreed at confirmation (carrier, cost, ETA), so the list reads without re-checking. */
import type { Booking, CheckResult } from '../domain/types';
import type { StorageLike } from './profiles';

export interface SavedBooking {
  /** Confirmation reference, e.g. PF-BK101-7QX2. Unique key. */
  ref: string;
  booking: Booking;
  carrierOverride: string | null;
  source: 'chat' | 'file';
  confirmedAt: number;
  carrier: string | null;
  cost: number | null;
  /** ISO date (YYYY-MM-DD) of the expected delivery, if known. */
  eta: string | null;
}

const KEY = 'garuda-bookings-v1';
const MAX = 200;

export function loadHistory(storage: StorageLike | null | undefined): SavedBooking[] {
  try {
    const raw = storage?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedBooking[]) : [];
    return Array.isArray(list) ? list.filter(x => x && typeof x.ref === 'string' && x.booking) : [];
  } catch {
    return [];
  }
}

function save(storage: StorageLike | null | undefined, list: SavedBooking[]): SavedBooking[] {
  try {
    storage?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: the list still shows for this visit */
  }
  return list;
}

/** The history entry for a booking confirmed now. */
export function entryFor(ref: string, result: CheckResult, carrierOverride: string | null, source: 'chat' | 'file', now = Date.now()): SavedBooking {
  const { _row, ...booking } = result.booking;
  void _row;
  const eta = result.eta;
  return {
    ref,
    booking: booking as Booking,
    carrierOverride,
    source,
    confirmedAt: now,
    carrier: result.rec.chosen?.key ?? null,
    cost: result.rec.chosen?.cost ?? null,
    eta: eta ? `${eta.getFullYear()}-${String(eta.getMonth() + 1).padStart(2, '0')}-${String(eta.getDate()).padStart(2, '0')}` : null,
  };
}

/** Add or replace (by reference) a confirmed booking; newest first, capped at 200. */
export function recordBooking(storage: StorageLike | null | undefined, entry: SavedBooking): SavedBooking[] {
  const list = loadHistory(storage).filter(x => x.ref !== entry.ref);
  return save(storage, [entry, ...list].slice(0, MAX));
}

export function removeBooking(storage: StorageLike | null | undefined, ref: string): SavedBooking[] {
  return save(storage, loadHistory(storage).filter(x => x.ref !== ref));
}
