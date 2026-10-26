/* Shareable links: the whole booking travels in the URL fragment, so nothing is stored on a server. */
import { normalizeBooking } from '../domain/normalize';
import type { Booking, RawBooking } from '../domain/types';

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
};

export const SHARE_PREFIX = 'share=';

export function encodeBooking(b: Booking, carrierOverride?: string | null): string {
  const { _row, ...rest } = b;
  void _row;
  const items = rest.items.map(({ _row: r, bookingId, ...it }) => (void r, void bookingId, it));
  return toB64Url(JSON.stringify({ v: 1, b: { ...rest, items }, c: carrierOverride || null }));
}

export function decodeBooking(s: string): { booking: Booking; carrierOverride: string | null } | null {
  try {
    const o = JSON.parse(fromB64Url(s)) as { v?: number; b?: RawBooking; c?: unknown };
    if (!o || o.v !== 1 || !o.b || typeof o.b !== 'object') return null;
    const booking = normalizeBooking(o.b);
    if (!booking.id) return null;
    return { booking, carrierOverride: typeof o.c === 'string' ? o.c : null };
  } catch {
    return null;
  }
}

/** A full URL that opens this booking in the chat. */
export const shareUrl = (base: string, b: Booking, carrierOverride?: string | null) => `${base.replace(/#.*$/, '')}#${SHARE_PREFIX}${encodeBooking(b, carrierOverride)}`;
