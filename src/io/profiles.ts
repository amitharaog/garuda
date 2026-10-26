/* Saved sellers and products, kept only in this browser (localStorage). Confirmed bookings teach Garuda a seller's
   usual collection city and each product's HS code, origin, pack size, weight and price, so repeat bookings take one line. */
import type { Booking } from '../domain/types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SavedProduct {
  description: string;
  sku: string;
  hs: string;
  origin: string;
  upc: number | null;
  unitWeight: number | null;
  unitPrice: number | null;
}

export interface SellerProfile {
  seller: string;
  originCity: string;
  products: SavedProduct[];
  lastBooking: Booking;
  savedAt: number;
}

export type Profiles = Record<string, SellerProfile>;

const KEY = 'garuda-profiles-v1';
const sellerKey = (s: string) => s.trim().toLowerCase();

export function loadProfiles(storage: StorageLike | null | undefined): Profiles {
  try {
    const raw = storage?.getItem(KEY);
    const o = raw ? (JSON.parse(raw) as Profiles) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

/** Remember a confirmed booking. Later bookings for the same seller update products by description. */
export function rememberBooking(storage: StorageLike | null | undefined, b: Booking, now = Date.now()): Profiles {
  const profiles = loadProfiles(storage);
  if (!b.seller) return profiles;
  const k = sellerKey(b.seller);
  const prev = profiles[k];
  const products = new Map((prev?.products || []).map(p => [p.description.toLowerCase(), p]));
  for (const it of b.items) {
    if (!it.description) continue;
    products.set(it.description.toLowerCase(), {
      description: it.description, sku: it.sku, hs: it.hs, origin: it.origin, upc: it.upc, unitWeight: it.unitWeight, unitPrice: it.unitPrice,
    });
  }
  profiles[k] = { seller: b.seller, originCity: b.originCity || prev?.originCity || '', products: [...products.values()], lastBooking: b, savedAt: now };
  try {
    storage?.setItem(KEY, JSON.stringify(profiles));
  } catch {
    /* storage full or blocked: the booking still goes ahead */
  }
  return profiles;
}

export const findSeller = (profiles: Profiles, seller: string): SellerProfile | null => profiles[sellerKey(seller)] || null;

export function lastBooking(profiles: Profiles): Booking | null {
  const all = Object.values(profiles).sort((a, z) => z.savedAt - a.savedAt);
  return all[0]?.lastBooking || null;
}

export const allProducts = (profiles: Profiles): SavedProduct[] => Object.values(profiles).flatMap(p => p.products);

const singular = (w: string) => w.replace(/(ies)$/, 'y').replace(/(ses|xes|ches|shes)$/, m => m.slice(0, -2)).replace(/s$/, '');
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2).map(singular);

/** The saved product a new description refers to: same text, or the same head noun plus at least one more shared word. */
export function matchProduct(products: SavedProduct[], description: string): SavedProduct | null {
  const d = description.trim().toLowerCase();
  const exact = products.find(p => p.description.toLowerCase() === d);
  if (exact) return exact;
  const w = words(description);
  const head = w[w.length - 1];
  let best: SavedProduct | null = null, bestScore = 0;
  for (const p of products) {
    const pw = words(p.description);
    if (!head || !pw.includes(head)) continue;
    const score = w.filter(x => pw.includes(x)).length;
    if (score >= 2 && score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}
