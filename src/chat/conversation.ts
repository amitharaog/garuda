/* The booking conversation: state, asking order, derived values, undo, fixes, confirmation.
   Port of the prototype's chat.js `Conversation`. Bot text is a small HTML subset; every user-supplied value goes through esc(). */
import {
  ALLOWED, CITY_TO_COUNTRY, applyAction, carrierKey, check, describeAction, fmtNum, kg, makeReference, money, niceDate,
  parseDate, plural, routeCarriers, suggestHS, uniq, cap, lowerFirst,
} from '../domain';
import type { Action, Booking, CheckResult, Item } from '../domain';
import { EU_CITIES, UK_CITIES, findCountry, isItemKey, resolveItem, singular, understand } from './understand';
import type { FieldSet, Pending } from './understand';
import { allProducts, findSeller, lastBooking, matchProduct } from '../io/profiles';
import type { Profiles } from '../io/profiles';

export type BotMessage =
  | { kind: 'text'; html: string; chips?: string[]; hint?: string; ask?: boolean; confirmActions?: boolean }
  | { kind: 'review'; result: CheckResult; compact?: boolean; partial?: boolean }
  | { kind: 'confirmation'; result: CheckResult; ref: string };

export interface ChatItem extends Item {
  _auto: { cartons?: boolean; sku?: boolean; saved?: boolean };
  _asked: { hs?: boolean; origin?: boolean };
}
export interface ChatBooking extends Omit<Booking, 'items'> {
  items: ChatItem[];
}

export const FIELD_LABEL: Record<string, string> = {
  seller: 'seller', originCity: 'origin city', originCountry: 'origin country', destCity: 'destination city', destCountry: 'destination country',
  destType: 'destination type', readyDate: 'ready to ship date', priority: 'priority', pallets: 'pallets', cartons: 'total cartons',
  declaredValue: 'declared value', currency: 'currency', grossWeight: 'gross weight', appointment: 'delivery appointment', description: 'description',
  sku: 'SKU', hs: 'HS code', qty: 'quantity', unitPrice: 'unit price', upc: 'units per carton', unitWeight: 'unit weight', origin: 'country of origin',
  carrier: 'carrier',
};
const ITEM_NUM_FIELDS = ['qty', 'unitPrice', 'upc', 'cartons', 'unitWeight'] as const;

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const fmtVal = (k: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '(blank)';
  if (k === 'declaredValue' || k === 'unitPrice') return money(v as number);
  if (k === 'grossWeight' || k === 'unitWeight') return kg(v as number);
  if (typeof v === 'number') return fmtNum(v);
  return String(v);
};

const text = (html: string, extra: Partial<Extract<BotMessage, { kind: 'text' }>> = {}): BotMessage => ({ kind: 'text', html, ...extra });

export function newChatBooking(): ChatBooking {
  return {
    id: 'BK-C' + String(Math.floor(Math.random() * 900) + 100), seller: '', originCity: '', originCountry: 'United Kingdom', destCity: '', destCountry: '',
    destType: '', readyDate: '', priority: '', pallets: null, cartons: null, declaredValue: null, currency: 'GBP', grossWeight: null, appointment: '', items: [],
  };
}
const newItem = (): ChatItem => ({ sku: '', description: '', hs: '', qty: null, unitPrice: null, upc: null, cartons: null, unitWeight: null, origin: '', _auto: {}, _asked: {} });
const asChatItem = (it: Partial<Item>, meta?: Pick<ChatItem, '_auto' | '_asked'>): ChatItem =>
  ({ ...newItem(), ...it, _auto: meta ? { ...meta._auto } : {}, _asked: meta ? { ...meta._asked } : { hs: true, origin: true } });

interface Snapshot {
  b: ChatBooking;
  stated: { cartons: boolean; declaredValue: boolean };
  cur: number;
  carrierOverride: string | null;
  itemsDone: boolean;
}

const FROM = { file: 'from your file', link: 'from a shared link', history: 'from your bookings' } as const;

export class Conversation {
  b!: ChatBooking;
  stated!: { cartons: boolean; declaredValue: boolean };
  cur = 0;
  pending: Pending | null = null;
  carrierOverride: string | null = null;
  confirmed: string | null = null;
  history: string[] = [];
  itemsDone = false;
  mode: 'chat' | 'file' = 'chat';
  /** Where an externally loaded booking came from. */
  loadedFrom: 'file' | 'link' | 'history' | null = null;
  lastResult: CheckResult | null = null;
  reviewed = false;
  private suggest: { code: string; item: number } | null = null;
  private estimate: number | null = null;
  private apptAsked = false;
  /** Sellers and products remembered from earlier confirmed bookings in this browser. */
  private memory: Profiles = {};

  constructor() {
    this.reset();
  }

  reset(): void {
    this.b = newChatBooking();
    this.stated = { cartons: false, declaredValue: false };
    this.cur = 0;
    this.pending = null;
    this.carrierOverride = null;
    this.confirmed = null;
    this.history = [];
    this.itemsDone = false;
    this.mode = 'chat';
    this.loadedFrom = null;
    this.lastResult = null;
    this.reviewed = false;
    this.suggest = null;
    this.estimate = null;
    this.apptAsked = false;
  }

  private snapshot(): string {
    const s: Snapshot = { b: this.b, stated: this.stated, cur: this.cur, carrierOverride: this.carrierOverride, itemsDone: this.itemsDone };
    return JSON.stringify(s);
  }
  private restore(s: string): void {
    const o = JSON.parse(s) as Snapshot;
    this.b = o.b; this.stated = o.stated; this.cur = o.cur; this.carrierOverride = o.carrierOverride; this.itemsDone = o.itemsDone;
  }

  /** The booking without chat-only metadata. */
  toBooking(): Booking {
    const b = JSON.parse(JSON.stringify(this.b)) as ChatBooking;
    return { ...b, items: b.items.map(({ _auto, _asked, ...it }) => it) };
  }
  result(): CheckResult {
    return check(this.toBooking(), { carrierOverride: this.carrierOverride });
  }

  /** Load a booking (from a file, a share link or My bookings) so it can be reviewed or fixed in chat. Values are kept exactly as written. */
  loadBooking(b: Booking, opts: { carrierOverride?: string | null; confirmed?: string | null; source?: 'file' | 'link' | 'history' } = {}): BotMessage[] {
    this.reset();
    const copy = JSON.parse(JSON.stringify(b)) as Booking;
    this.b = { ...copy, items: copy.items.map(it => asChatItem(it)) };
    this.stated = { cartons: true, declaredValue: true };
    this.itemsDone = true;
    this.mode = 'file';
    this.loadedFrom = opts.source || 'file';
    this.reviewed = true;
    this.carrierOverride = opts.carrierOverride || null;
    this.confirmed = opts.confirmed || null;
    const r = this.result();
    this.lastResult = r;
    return [
      text(`I've loaded <b>${esc(b.id)}</b> for <b>${esc(b.seller || 'this seller')}</b> ${FROM[opts.source || 'file']}. Every value is kept exactly as ${opts.source === 'link' ? 'it was shared' : opts.source === 'history' ? 'it was booked' : 'you wrote it'}.`),
      ...this.reviewMessages(r),
    ];
  }

  /** Apply a structured fix (from a button). */
  applyFix(action: Action): BotMessage[] {
    this.history.push(this.snapshot());
    const before = this.result();
    if (action.type === 'carrier') this.carrierOverride = action.value;
    else {
      const nb = applyAction(this.toBooking(), action);
      const metas = action.type === 'removeItem' ? this.b.items.filter((_, i) => i !== action.index) : this.b.items;
      this.b = { ...this.b, ...nb, items: nb.items.map((it, i) => asChatItem(it, metas[i])) };
      if (action.type === 'setItem' && (action.field === 'hs' || action.field === 'origin')) this.b.items[action.index]._asked[action.field] = true;
      if (action.type === 'setBooking' && (action.field === 'cartons' || action.field === 'declaredValue')) this.stated[action.field] = true;
      if (this.cur >= this.b.items.length) this.cur = Math.max(0, this.b.items.length - 1);
    }
    this.confirmed = null;
    return this.afterChange(before, [`Applied: ${action.label || describeAction(action, f => FIELD_LABEL[f] || f)}`], []);
  }

  /** Apply several structured fixes as one step (one undo), e.g. "3 pallets with Carrier B". */
  applyFixes(actions: Action[], label: string): BotMessage[] {
    this.history.push(this.snapshot());
    const before = this.result();
    for (const action of actions) {
      if (action.type === 'carrier') { this.carrierOverride = action.value; continue; }
      const nb = applyAction(this.toBooking(), action);
      const metas = action.type === 'removeItem' ? this.b.items.filter((_, i) => i !== action.index) : this.b.items;
      this.b = { ...this.b, ...nb, items: nb.items.map((it, i) => asChatItem(it, metas[i])) };
      if (action.type === 'setBooking' && (action.field === 'cartons' || action.field === 'declaredValue')) this.stated[action.field] = true;
    }
    this.confirmed = null;
    return this.afterChange(before, [`Applied: ${label}`], []);
  }

  /** A direct edit from the booking panel. */
  editField(field: string, value: string | number | null, idx?: number | null): BotMessage[] {
    this.history.push(this.snapshot());
    const before = this.reviewed ? this.result() : null;
    const changes: string[] = [], notes: string[] = [];
    if (idx !== undefined && idx !== null) this.setItemField(idx, field, value, changes);
    else this.setBookingField(field, value, changes, notes, { field, stated: true });
    if (field === 'cartons' && (idx === undefined || idx === null)) this.stated.cartons = true;
    if (field === 'declaredValue') this.stated.declaredValue = true;
    this.derive(notes);
    this.confirmed = null;
    if (!changes.length) { this.history.pop(); return []; }
    return this.afterChange(before, changes.map(c => 'In the panel: ' + lowerFirst(c)), notes);
  }

  /** Give the conversation what this browser remembers (saved sellers and products). */
  setMemory(profiles: Profiles): void {
    this.memory = profiles;
  }
  hasLastBooking(): Booking | null {
    return lastBooking(this.memory);
  }

  /** Start a new booking as a copy of an earlier one: new reference, ready date and appointment asked again. */
  loadTemplate(b: Booking): BotMessage[] {
    this.reset();
    const copy = JSON.parse(JSON.stringify(b)) as Booking;
    this.b = {
      ...copy, id: newChatBooking().id, readyDate: '', appointment: copy.destType === 'Warehouse' ? '' : copy.appointment, _row: undefined,
      items: copy.items.map(it => asChatItem(it)),
    };
    this.stated = { cartons: true, declaredValue: true };
    this.itemsDone = true;
    this.history.push(this.snapshot());
    const r = this.result();
    this.lastResult = r;
    return [text(`Copied your last booking for <b>${esc(copy.seller)}</b> (${esc(copy.originCity)} → ${esc(copy.destCity)}, ${copy.items.length} product line${copy.items.length === 1 ? '' : 's'}, ${fmtNum(copy.pallets)} pallets). Change anything that's different, e.g. <i>"make it 5 pallets"</i>.`), ...this.ask()];
  }

  addItemFromPanel(): BotMessage[] {
    this.history.push(this.snapshot());
    this.b.items.push(newItem());
    this.cur = this.b.items.length - 1;
    this.itemsDone = false;
    return this.ask();
  }
  removeItemFromPanel(i: number): BotMessage[] {
    return this.handle(`remove item ${i + 1}`);
  }

  /** Main entry: the user typed something. */
  handle(input: string): BotMessage[] {
    const u = understand(input, { b: this.b, items: this.b.items, pending: this.pending, suggestHS: this.suggest, estimate: this.estimate });
    if (u.cmd === 'reset') {
      this.reset();
      return [text("Okay, let's start a fresh booking. Describe your shipment in your own words: what you're sending, from where to where, how many pallets, and when it's ready.")];
    }
    if (u.cmd === 'undo') {
      const last = this.history.pop();
      if (!last) return [text('There is nothing to undo yet.')];
      const before = this.result();
      this.restore(last);
      this.confirmed = null;
      return this.afterChange(before, ['Undid the last change.'], []);
    }
    if (u.cmd === 'help') return [text(helpText())];
    if (u.cmd === 'repeatLast') {
      const last = lastBooking(this.memory);
      if (!last) return [text('There is no earlier booking saved in this browser yet. Confirm a booking once and you can repeat it with one line.')];
      return this.loadTemplate(last);
    }
    if (u.cmd === 'review') {
      const r = this.result();
      if (!this.isComplete()) return [text(`Here's where we are so far. Still needed: ${esc(this.missingList().join(', '))}.`), { kind: 'review', result: r, partial: true }, ...this.ask()];
      return this.reviewMessages(r);
    }
    if (u.cmd === 'confirm') return this.confirm();

    this.history.push(this.snapshot());
    const before = this.lastResult;
    const changes: string[] = [], notes: string[] = [];

    if (u.removeItem !== undefined) {
      const it = this.b.items[u.removeItem];
      const prev = { c: this.b.cartons, v: this.b.declaredValue, w: this.b.grossWeight };
      const nb = applyAction(this.toBooking(), { type: 'removeItem', index: u.removeItem });
      const metas = this.b.items.filter((_, i) => i !== u.removeItem);
      this.b = { ...this.b, ...nb, items: nb.items.map((x, i) => asChatItem(x, metas[i])) };
      if (this.stated.cartons && prev.c !== this.b.cartons) notes.push(`Total cartons ${prev.c} → ${this.b.cartons} (its cartons are no longer on the pallets).`);
      if (this.stated.declaredValue && prev.v !== this.b.declaredValue) notes.push(`Declared value ${money(prev.v)} → ${money(this.b.declaredValue)}.`);
      if (prev.w !== this.b.grossWeight) notes.push(`Gross weight ${kg(prev.w)} → ${kg(this.b.grossWeight)} (minus its ${kg((it.qty || 0) * (it.unitWeight || 0))}).`);
      if (this.cur >= this.b.items.length) this.cur = Math.max(0, this.b.items.length - 1);
      changes.push(`Removed ${it.sku || it.description} from the shipment.`);
    }
    if (u.cmd === 'noMoreItems') { this.itemsDone = true; changes.push('Noted: that is the full product list.'); }
    if (u.cmd === 'addItem') { this.b.items.push(newItem()); this.cur = this.b.items.length - 1; this.itemsDone = false; }

    // New products
    for (const p of u.items) {
      let idx: number;
      // Only merge into an existing line when the head noun matches ("hair spray" is not "hair brushes").
      const head = (d: string) => singular(d.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).pop() || '');
      const match = resolveItem(p.description, this.b.items);
      const existing = match !== null && head(this.b.items[match].description) === head(p.description) ? match : null;
      const curIt = this.b.items[this.cur];
      if (existing !== null) idx = existing;
      else if (curIt && !curIt.description) idx = this.cur;
      else { this.b.items.push(newItem()); idx = this.b.items.length - 1; if (idx > 0) this.itemsDone = false; }
      const it = this.b.items[idx];
      if (!it.description) { it.description = p.description; changes.push(`Product: ${p.description}`); }
      if (p.qty !== null && it.qty !== p.qty) { changes.push(`${it.sku || it.description} quantity: ${fmtVal('qty', it.qty)} → ${fmtVal('qty', p.qty)}`.replace('(blank) → ', '')); it.qty = p.qty; }
      this.cur = idx;
    }

    // Field updates
    for (const s of u.sets) {
      const early = this.applySet(s, changes, notes);
      if (early) return early;
    }

    this.derive(notes);
    const r = this.result();
    if (!changes.length && !u.cmd && u.sets.length) {
      this.history.pop();
      return [text(`No change needed: that already matches the booking (${esc(uniq(u.sets.map(x => FIELD_LABEL[x.field] || x.field)).join(', '))}).`), ...(this.isComplete() ? [] : this.ask())];
    }
    if (!changes.length && !u.cmd) {
      this.history.pop();
      const again = this.ask();
      return [text(`Sorry, I couldn't match that to a booking detail.${this.pending ? '' : ' You can say things like "add a pallet", "change destination to Paris" or "set HS code for MUG-01 to 691200".'} You can also edit any field directly in the booking panel.`), ...again];
    }
    return this.afterChange(before, changes, notes, r);
  }

  /** Apply one understood field update. Returns messages only when it needs to stop and ask. */
  private applySet(s: FieldSet, changes: string[], notes: string[]): BotMessage[] | null {
    if (s.field === 'carrier') {
      this.carrierOverride = s.value ? this.resolveCarrierKey(String(s.value)) : null;
      changes.push(s.value ? `Carrier set to ${this.carrierOverride}` : 'Back to the recommended carrier');
      return null;
    }
    if (s.field === 'cartons' && s.delta !== undefined && (s.cartonScope === 'itemDelta' || (this.b.items.length > 1 && !this.stated.cartons))) {
      if (s.cartonScope !== 'itemDelta') {
        this.history.pop();
        const n = Math.abs(s.delta);
        return [text(`Which product are the ${n} ${s.delta > 0 ? 'extra' : 'fewer'} cartons for? Say e.g. <i>"${s.delta > 0 ? 'add' : 'remove'} ${n} cartons of ${esc(this.b.items[0].description.toLowerCase())}"</i>.`)];
      }
      this.bumpItemCartons(s.item as number, s.delta, changes);
      return null;
    }
    if (s.item !== undefined || (isItemKey(s.field) && s.cartonScope !== 'booking' && s.cartonScope !== 'auto')) {
      if (!(s.field === 'cartons' && s.cartonScope !== 'item' && s.item === undefined)) {
        this.setItemField(s.item === 'cur' || s.item === undefined ? this.cur : s.item, s.field, s.value ?? null, changes);
        return null;
      }
    }
    if (s.field === 'cartons') {
      const scope = s.cartonScope || 'auto';
      if (scope === 'item') { this.setItemField(this.cur, 'cartons', s.value ?? null, changes); return null; }
      if (scope === 'booking' || this.b.items.length > 1 || (s.delta !== undefined && this.stated.cartons)) {
        const old = this.b.cartons;
        const nv = s.delta !== undefined ? (old || 0) + s.delta : (s.value as number);
        this.b.cartons = Math.max(0, nv);
        this.stated.cartons = true;
        if (old !== this.b.cartons) changes.push(`Total cartons: ${fmtVal('cartons', old)} → ${fmtVal('cartons', this.b.cartons)}`.replace('(blank) → ', ''));
        return null;
      }
      // One product: the carton count belongs to the item (the booking total follows).
      if (!this.b.items.length) { this.b.items.push(newItem()); this.cur = 0; }
      if (s.delta !== undefined) this.bumpItemCartons(this.cur, s.delta, changes);
      else this.setItemField(this.cur, 'cartons', s.value ?? null, changes);
      return null;
    }
    if (s.delta !== undefined) {
      const key = s.field as 'pallets';
      const old = this.b[key];
      const nv = Math.max(0, (old || 0) + s.delta);
      this.b[key] = nv;
      changes.push(`${cap(FIELD_LABEL[s.field])}: ${fmtVal(s.field, old)} → ${fmtVal(s.field, nv)}`);
      return null;
    }
    this.setBookingField(s.field, s.value ?? null, changes, notes, s);
    return null;
  }

  private bumpItemCartons(idx: number, delta: number, changes: string[]): void {
    const it = this.b.items[idx];
    const oldC = it.cartons || 0, newC = Math.max(0, oldC + delta);
    it.cartons = newC;
    it._auto.cartons = false;
    this.cur = idx;
    if (it.upc) {
      const oldQ = it.qty;
      it.qty = newC * it.upc;
      changes.push(`${it.sku || it.description} cartons: ${oldC} → ${newC} (quantity ${fmtNum(oldQ)} → ${fmtNum(it.qty)} at ${it.upc} per carton)`);
    } else changes.push(`${it.sku || it.description} cartons: ${oldC} → ${newC}`);
  }

  private resolveCarrierKey(v: string): string {
    const c = routeCarriers(this.b.destCountry).find(x => x.carrier === v);
    return c ? carrierKey(c) : v;
  }

  private setItemField(idx: number | 'cur', field: string, value: string | number | null, changes: string[]): void {
    let i = idx === 'cur' ? this.cur : idx;
    if (!this.b.items.length) { this.b.items.push(newItem()); i = 0; this.cur = 0; }
    if (!this.b.items[i]) i = this.cur;
    const it = this.b.items[i];
    const rec = it as unknown as Record<string, unknown>;
    const old = rec[field];
    let v = value;
    if (field === 'hs') { it._asked.hs = true; v = String(v ?? ''); }
    if (field === 'origin') { it._asked.origin = true; if (v) v = findCountry(String(v)) || v; else v = ''; }
    if (field === 'description' || field === 'sku') v = String(v ?? '');
    rec[field] = v;
    if (field === 'cartons') it._auto.cartons = false;
    if (field === 'sku') it._auto.sku = false;
    const name = it.sku || it.description || `item ${i + 1}`;
    if ((field === 'hs' || field === 'origin') && !v && !old)
      changes.push(`${name}: ${FIELD_LABEL[field]} left blank for now. It will be flagged (${field === 'hs' ? 'R-01, red' : 'R-09, amber'}) so you can add it before booking`);
    else if (old !== v) changes.push(`${name} ${FIELD_LABEL[field]}: ${fmtVal(field, old)} → ${fmtVal(field, v)}`.replace(': (blank) → ', ': '));
    this.cur = i;
  }

  private setBookingField(field: string, value: string | number | null, changes: string[], notes: string[], s?: FieldSet): void {
    const rec = this.b as unknown as Record<string, unknown>;
    const old = rec[field];
    if (field === 'destCity') {
      const city = String(value ?? '');
      this.b.destCity = city;
      const c = CITY_TO_COUNTRY[city];
      if (c && this.b.destCountry !== c) {
        if (this.b.destCountry) notes.push(`${city} is in ${c}, so I updated the destination country too.`);
        this.b.destCountry = c;
      }
    } else if (field === 'destCountry') {
      this.b.destCountry = String(value ?? '');
      if (this.b.destCity && CITY_TO_COUNTRY[this.b.destCity] !== value) {
        notes.push(`${this.b.destCity} isn't in ${value}, so I've cleared the city.`);
        this.b.destCity = '';
      }
    } else rec[field] = value;
    if ((field === 'cartons' || field === 'declaredValue') && s?.stated) this.stated[field] = true;
    if (field === 'destType' && value === 'Business address' && !this.b.appointment) this.b.appointment = 'No';
    if (field === 'destType' && value === 'Warehouse' && old === 'Business address' && this.b.appointment === 'No' && !this.apptAsked) this.b.appointment = '';
    if (field === 'appointment') this.apptAsked = true;
    if (field === 'readyDate' && s?.rel) notes.push(`I read "${s.rel}" as ${niceDate(parseDate(value))}.`);
    if (old !== rec[field] && field !== 'destCity') changes.push(`${cap(FIELD_LABEL[field] || field)}: ${fmtVal(field, old)} → ${fmtVal(field, rec[field])}`.replace(': (blank) → ', ': '));
    if (field === 'destCity' && old !== value) changes.push(`Destination: ${value}, ${this.b.destCountry}`);
  }

  /** Fill in values we can work out, and say so. */
  private derive(notes: string[]): void {
    // Fill in what this browser already knows about the seller and their products.
    const profile = this.b.seller ? findSeller(this.memory, this.b.seller) : null;
    if (profile && !this.b.originCity && profile.originCity) {
      this.b.originCity = profile.originCity;
      notes.push(`${profile.seller} usually ships from ${profile.originCity}, so I've used that. Change it if not.`);
    }
    const products = allProducts(this.memory);
    if (products.length) this.b.items.forEach(it => {
      if (!it.description || it._auto.saved) return;
      const p = matchProduct(products, it.description);
      if (!p) return;
      const filled: string[] = [];
      if (!it.hs && !it._asked.hs && p.hs) { it.hs = p.hs; it._asked.hs = true; filled.push(`HS ${p.hs}`); }
      if (!it.origin && !it._asked.origin && p.origin) { it.origin = p.origin; it._asked.origin = true; filled.push(`made in ${p.origin}`); }
      if (it.upc === null && p.upc !== null) { it.upc = p.upc; filled.push(`${p.upc} per carton`); }
      if (it.unitWeight === null && p.unitWeight !== null) { it.unitWeight = p.unitWeight; filled.push(`${kg(p.unitWeight)} each`); }
      if (it.unitPrice === null && p.unitPrice !== null) { it.unitPrice = p.unitPrice; filled.push(`${money(p.unitPrice)} each`); }
      it._auto.saved = true;
      if (filled.length) notes.push(`${it.description}: filled from your saved product "${p.description}" (${filled.join(', ')}).`);
    });
    this.b.items.forEach((it, i) => {
      if ((it.cartons === null || it._auto.cartons) && it.qty && it.upc) {
        const c = it.qty / it.upc;
        if (Number.isInteger(c) && it.cartons !== c) {
          if (it.cartons === null) notes.push(`${it.description || 'Item'}: ${fmtNum(it.qty)} ÷ ${it.upc} per carton = ${c} cartons. I've filled that in.`);
          it.cartons = c;
          it._auto.cartons = true;
        }
      }
      if (!it.sku && it.description) {
        // Product code from the description: last meaningful word + line number (e.g. MUGS-01).
        const base = it.description.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(w => w.length > 2).pop() || 'ITEM';
        it.sku = base.slice(0, 4).toUpperCase() + '-' + String(i + 1).padStart(2, '0');
        it._auto.sku = true;
      }
    });
    const items = this.b.items;
    if (!this.stated.cartons && items.length && items.every(it => it.cartons !== null)) this.b.cartons = items.reduce((s, it) => s + (it.cartons as number), 0);
    if (!this.stated.declaredValue && items.length && items.every(it => it.qty !== null && it.unitPrice !== null))
      this.b.declaredValue = Math.round(items.reduce((s, it) => s + (it.qty as number) * (it.unitPrice as number), 0) * 100) / 100;
    if (this.b.destCity && !this.b.destCountry) this.b.destCountry = CITY_TO_COUNTRY[this.b.destCity] || '';
    if (this.b.destType === 'Business address' && !this.b.appointment) this.b.appointment = 'No';
  }

  /** The next thing to ask for, in asking order. */
  nextMissing(): Pending | null {
    const b = this.b;
    if (!b.seller) return { field: 'seller' };
    if (!b.originCity) return { field: 'originCity' };
    if (!b.destCity) return { field: 'destCity' };
    if (!b.destType) return { field: 'destType' };
    if (!b.items.length) return { field: 'description', item: 0 };
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i];
      if (!it.description) return { field: 'description', item: i };
      for (const f of ITEM_NUM_FIELDS) if (it[f] === null || it[f] === undefined) return { field: f, item: i };
      if (!it.hs && !it._asked.hs) return { field: 'hs', item: i };
      if (!it.origin && !it._asked.origin) return { field: 'origin', item: i };
    }
    if (!this.itemsDone) return { field: 'moreItems' };
    if (b.pallets === null || b.pallets === undefined) return { field: 'pallets' };
    if (b.grossWeight === null || b.grossWeight === undefined) return { field: 'grossWeight' };
    if (!b.readyDate) return { field: 'readyDate' };
    if (!b.priority) return { field: 'priority' };
    if (b.destType === 'Warehouse' && !b.appointment) return { field: 'appointment' };
    if (b.cartons === null) return { field: 'cartons' };
    if (b.declaredValue === null) return { field: 'declaredValue' };
    return null;
  }
  isComplete(): boolean {
    return !this.nextMissing();
  }
  missingList(): string[] {
    const out: string[] = [];
    const b = this.b;
    const add = (c: boolean, l: string) => { if (c) out.push(l); };
    add(!b.seller, 'seller name'); add(!b.originCity, 'collection city'); add(!b.destCity, 'destination city'); add(!b.destType, 'destination type');
    if (!b.items.length) out.push('products');
    b.items.forEach(it => {
      const miss = ITEM_NUM_FIELDS.filter(f => it[f] === null).map(f => FIELD_LABEL[f]);
      if (!it.hs && !it._asked.hs) miss.push('HS code');
      if (!it.origin && !it._asked.origin) miss.push('country of origin');
      if (miss.length) out.push(`${it.description || 'product'}: ${miss.join(', ')}`);
    });
    add(b.pallets === null, 'pallets'); add(b.grossWeight === null, 'gross weight'); add(!b.readyDate, 'ready date'); add(!b.priority, 'priority');
    add(b.destType === 'Warehouse' && !b.appointment, 'delivery appointment');
    return out;
  }

  /** Ask for the next missing value, with tap-to-answer chips where the choices are fixed. */
  ask(): BotMessage[] {
    const nm = this.nextMissing();
    this.suggest = null;
    this.estimate = null;
    if (!nm) { this.pending = null; return []; }
    this.pending = nm;
    const it = nm.item !== undefined ? this.b.items[nm.item] : null;
    const name = it ? (it.description ? `<b>${esc(it.description)}</b>` : 'this product') : '';
    let q = '';
    let chips: string[] = [];
    let hint: string | undefined;
    switch (nm.field) {
      case 'seller': q = "What's the name of the business sending the goods?"; break;
      case 'originCity': q = 'Which city are the goods collected from?'; chips = [...UK_CITIES]; break;
      case 'destCity':
        q = this.b.destCountry ? `Which city in ${esc(this.b.destCountry)}?` : 'Where are the goods going?';
        chips = this.b.destCountry ? ALLOWED.destCities[this.b.destCountry] || [...EU_CITIES] : [...EU_CITIES];
        break;
      case 'destType':
        q = `Is the ${esc(this.b.destCity || 'destination')} address a <b>warehouse</b> (fulfilment or distribution centre) or a <b>business address</b> (shop, office)?`;
        chips = ['Warehouse', 'Business address'];
        break;
      case 'description':
        q = this.b.items.length > 1 || (nm.item ?? 0) > 0
          ? 'What is the next product, and how many units? (e.g. "200 cotton t-shirts")'
          : 'What are you shipping? Tell me the product and how many units, e.g. "1,080 ceramic mugs at £5 each, 12 per carton".';
        break;
      case 'qty': q = `How many units of ${name} in total?`; break;
      case 'unitPrice': q = `What's the price of one ${name} in GBP?`; break;
      case 'upc': q = `How many units of ${name} are packed in one carton?`; break;
      case 'cartons': q = it ? `How many cartons of ${name}?` : 'How many cartons in total?'; break;
      case 'unitWeight': q = `How much does one ${name} weigh (kg)?`; break;
      case 'hs': {
        const sg = suggestHS(it?.description);
        q = `What's the HS code for ${name}? Customs needs at least 6 digits.`;
        if (sg) {
          q += ` It's likely <b>${sg.code}</b> (${esc(sg.label)}); please check it fits.`;
          this.suggest = { code: sg.code, item: nm.item as number };
          chips = [`Use ${sg.code}`, "I don't know"];
        } else chips = ["I don't know"];
        hint = 'You can look codes up on the UK Trade Tariff (trade-tariff.service.gov.uk).';
        break;
      }
      case 'origin': q = `Where were the ${name} made? (Country of origin: where it was produced, not where it ships from.)`; chips = [...ALLOWED.itemOrigin, 'Not sure']; break;
      case 'moreItems': q = `Is ${this.b.items.length === 1 ? 'that the only product' : 'that everything'} in this shipment?`; chips = ["That's everything", 'Add another product']; break;
      case 'pallets': q = 'How many pallets will it be on?'; break;
      case 'grossWeight': {
        const net = this.b.items.reduce((s, x) => s + (x.unitWeight || 0) * (x.qty || 0), 0);
        q = "What's the total gross weight in kg, goods plus cartons and pallets?";
        if (net > 0) {
          const est = Math.ceil(net + (this.b.pallets || 1) * 25 + (this.b.cartons || 0) * 0.3);
          this.estimate = est;
          q += ` The goods alone weigh ${kg(net)}, so I'd expect about <b>${fmtNum(est)} kg</b> all in.`;
          chips = [`Use estimate (${fmtNum(est)} kg)`];
        }
        break;
      }
      case 'readyDate': q = 'When will the goods be packed and ready for collection? (DD-MM-YYYY, or say "next Monday")'; chips = ['Tomorrow', 'Next Monday']; break;
      case 'priority':
        q = 'What matters most for this shipment?';
        chips = ['Cheapest', 'Fastest', 'Most reliable', 'Balanced'];
        hint = 'Most reliable = highest on-time rate. Balanced = best trade-off of cost, speed and reliability.';
        break;
      case 'appointment': q = `Have you booked a delivery time slot at the ${esc(this.b.destCity || '')} warehouse?`; chips = ['Yes, booked', 'Not yet']; break;
      case 'declaredValue': q = 'What is the total declared value in GBP?'; break;
    }
    return [text(q, { chips, hint, ask: true })];
  }

  private afterChange(before: CheckResult | null, changes: string[], notes: string[], res?: CheckResult): BotMessage[] {
    const r = res || this.result();
    const msgs: BotMessage[] = [];
    let body = '';
    if (changes.length)
      body += changes.length > 1 ? 'Got it:<ul>' + changes.map(c => `<li>${esc(c)}</li>`).join('') + '</ul>' : `Got it: ${esc(lowerFirst(changes[0]))}`;
    if (notes.length) body += `<div class="note">${notes.map(esc).join('<br>')}</div>`;
    // What changed in the checks (only once the booking has been reviewed)
    if (before && this.reviewed) {
      const blocking = (i: { severity: string }) => i.severity === 'Red' || i.severity === 'Amber';
      const key = (i: { rule: string; itemIndex?: number; severity: string }) => `${i.rule}|${i.itemIndex ?? ''}|${i.severity}`;
      const bk = new Set(before.issues.filter(blocking).map(key));
      const ak = new Set(r.issues.filter(blocking).map(key));
      const lines: string[] = [];
      before.issues.filter(i => blocking(i) && !ak.has(key(i))).forEach(i => lines.push(`<span class="ok">✓ ${i.rule} fixed</span>: ${esc(i.title)}`));
      r.issues.filter(i => blocking(i) && !bk.has(key(i))).forEach(i => lines.push(`<span class="sev-${i.severity.toLowerCase()}">● ${i.rule} new ${i.severity.toLowerCase()} issue</span>: ${esc(i.title)}`));
      const bc = before.rec.chosen, ac = r.rec.chosen;
      if (bc && ac && (bc.key !== ac.key || bc.cost !== ac.cost)) lines.push(`Carrier: ${esc(bc.key)} ${money(bc.cost)} → <b>${esc(ac.key)} ${money(ac.cost)}</b>`);
      if (before.status !== r.status) lines.push(`Status: ${before.status} → <b>${r.status}</b>`);
      body += lines.length
        ? `<div class="delta"><b>Checks re-run:</b><br>${lines.join('<br>')}</div>`
        : `<div class="delta">Checks re-run: no change in results (${r.status}).</div>`;
    }
    if (body) msgs.push(text(body));
    this.lastResult = r;
    if (!this.isComplete()) { msgs.push(...this.ask()); return msgs; }
    this.pending = null;
    if (!this.reviewed) {
      this.reviewed = true;
      msgs.push(text("That's everything I need. I've run all 10 rulebook checks:"));
      msgs.push(...this.reviewMessages(r));
    } else msgs.push({ kind: 'review', result: r, compact: true });
    return msgs;
  }

  private reviewMessages(r: CheckResult): BotMessage[] {
    const msgs: BotMessage[] = [{ kind: 'review', result: r }];
    const reds = r.issues.filter(i => i.severity === 'Red');
    if (reds.length)
      msgs.push(text(`Fix the red issue${reds.length > 1 ? 's' : ''} above with the buttons, or just tell me, e.g. <i>"set declared value to 5400"</i>, <i>"add a pallet"</i>, <i>"HS code for ${esc(r.booking.items[0]?.sku || 'MUG-01')} is 691200"</i>. I re-check everything after each change.`));
    else msgs.push(text(r.status === 'Amber' ? 'No blocking issues. You can fix the amber warnings, or confirm and accept the risk.' : 'All checks passed. Ready when you are.', { confirmActions: true }));
    return msgs;
  }

  confirm(): BotMessage[] {
    if (!this.isComplete()) return [text(`I can't confirm yet. Still needed: ${esc(this.missingList().join(', '))}.`), ...this.ask()];
    const r = this.result();
    if (r.status === 'Red') {
      const ids = uniq(r.issues.filter(i => i.severity === 'Red').map(i => i.rule)).join(', ');
      return [text(`I can't book this yet: ${plural(r.red, 'red issue')} would stop the shipment (${ids}). Fix ${r.red > 1 ? 'them' : 'it'} first and I'll re-check instantly.`), { kind: 'review', result: r, compact: true }];
    }
    this.confirmed = makeReference();
    return [{ kind: 'confirmation', result: r, ref: this.confirmed }];
  }
}

export function helpText(): string {
  return `Describe your shipment in plain words and I'll ask only for what's missing. Things you can say any time:
<ul><li><i>"add a pallet"</i> / <i>"remove 2 cartons"</i></li><li><i>"change destination to Paris"</i>, <i>"make it fastest"</i></li><li><i>"set HS code for MUG-01 to 691200"</i>, <i>"the mugs are made in China"</i></li><li><i>"we've booked the delivery slot"</i>, <i>"use carrier B"</i></li><li><i>"add another product"</i>, <i>"remove the candles"</i></li><li><i>"undo"</i>, <i>"show booking"</i>, <i>"confirm"</i>, <i>"start over"</i></li></ul>`;
}
