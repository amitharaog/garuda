/* One-click fixes: apply a structured Action to a booking (returns a new booking). */
import { round2 } from './format';
import { cloneBooking } from './normalize';
import type { Action, Booking } from './types';

export function applyAction(booking: Booking, action: Action): Booking {
  const b = cloneBooking(booking);
  if (action.type === 'setBooking') (b as unknown as Record<string, unknown>)[action.field] = action.value;
  else if (action.type === 'setItem') {
    const it = b.items[action.index];
    if (it) (it as unknown as Record<string, unknown>)[action.field] = action.value;
  } else if (action.type === 'removeItem') {
    const it = b.items[action.index];
    if (!it) return b;
    b.items.splice(action.index, 1);
    // Keep the booking totals consistent with the line that left.
    if (it.cartons !== null && b.cartons !== null) b.cartons = Math.max(0, b.cartons - it.cartons);
    if (it.qty !== null && it.unitPrice !== null && b.declaredValue !== null) {
      // Only reduce the declared value if it had included this item (reducing brings it closer to the remaining lines).
      const rest = b.items.reduce((s, x) => s + (x.qty || 0) * (x.unitPrice || 0), 0);
      const reduced = round2(Math.max(0, b.declaredValue - it.qty * it.unitPrice));
      if (Math.abs(reduced - rest) < Math.abs(b.declaredValue - rest)) b.declaredValue = reduced;
    }
    if (it.qty !== null && it.unitWeight !== null && b.grossWeight !== null) b.grossWeight = round2(Math.max(0, b.grossWeight - it.qty * it.unitWeight));
  }
  // 'carrier' actions change the carrier override, not the booking.
  return b;
}

export function describeAction(a: Action, fieldLabel: (f: string) => string = f => f): string {
  if (a.type === 'carrier') return `carrier → ${a.value ?? 'recommended'}`;
  if (a.type === 'removeItem') return `removed item ${a.index + 1}`;
  return `${fieldLabel(a.field)} → ${a.value}`;
}
