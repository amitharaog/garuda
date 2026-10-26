/* Core types shared by the rules engine, the chat assistant, file IO and the UI. */

export type RuleSeverity = 'Red' | 'Amber';
export type Severity = RuleSeverity | 'Notice' | 'Info';
export type Status = 'Red' | 'Amber' | 'Green';
export type Priority = 'Cheapest' | 'Fastest' | 'Most reliable' | 'Balanced';

export interface Item {
  bookingId?: string;
  sku: string;
  description: string;
  /** Always text, so leading zeros survive. */
  hs: string;
  qty: number | null;
  unitPrice: number | null;
  /** Units per carton. */
  upc: number | null;
  cartons: number | null;
  unitWeight: number | null;
  origin: string;
  _row?: number;
}

export interface Booking {
  id: string;
  seller: string;
  originCity: string;
  originCountry: string;
  destCity: string;
  destCountry: string;
  destType: string;
  /** DD-MM-YYYY text (kept as typed when it cannot be parsed). */
  readyDate: string;
  priority: string;
  pallets: number | null;
  cartons: number | null;
  declaredValue: number | null;
  currency: string;
  grossWeight: number | null;
  appointment: string;
  items: Item[];
  _row?: number;
}

/** Loose input: values straight from a sheet, a CSV or a form. */
export type RawItem = { [K in keyof Item]?: unknown };
export type RawBooking = { [K in keyof Omit<Booking, 'items'>]?: unknown } & { items?: RawItem[] };

export type BookingField = Exclude<keyof Booking, 'items' | '_row'>;
export type ItemField = Exclude<keyof Item, '_row' | 'bookingId'>;
export type FieldValue = string | number | null;

export type Action =
  | { type: 'setBooking'; field: BookingField; value: FieldValue; label?: string }
  | { type: 'setItem'; index: number; field: ItemField; value: FieldValue; label?: string }
  | { type: 'removeItem'; index: number; label?: string }
  | { type: 'carrier'; value: string | null; label?: string };

export interface Fix {
  label: string;
  action: Action;
}

export interface Issue {
  rule: string;
  severity: Severity;
  ruleText: string;
  /** True for checks that are not in the judges' rulebook (X-xx). */
  extra: boolean;
  title: string;
  what: string;
  fix: string;
  fixes?: Fix[];
  itemIndex?: number;
  missingList?: string[];
  numbers?: Record<string, number>;
}

export interface Carrier {
  carrier: string;
  service: string;
  origin: string;
  dest: string;
  /** GBP per pallet. */
  price: number;
  /** Transit days. */
  transit: number;
  /** On-time rate, percent. */
  ontime: number;
  /** Max kg per pallet. */
  maxKg: number;
}

export interface CarrierScores {
  cost: number;
  speed: number;
  reliability: number;
}

export interface CarrierOption {
  c: Carrier;
  key: string;
  cost: number | null;
  wpp: number | null;
  /** null when weight per pallet is unknown. */
  eligible: boolean | null;
  palletsNeeded: number | null;
  scores: CarrierScores;
  balancedMin: number;
  balancedAvg: number;
  rank?: number;
}

export type CarrierNote =
  | { type: 'r05-switch'; text: string; preferred: string; palletsNeeded: number | null; altCost: number | null }
  | { type: 'r05-none'; text: string }
  | { type: 'override'; text: string }
  | { type: 'priority'; text: string };

export type RecommendMode = 'auto' | 'override' | 'none-eligible';

export interface Recommendation {
  chosen: CarrierOption | null;
  preferred: CarrierOption | null;
  options: CarrierOption[];
  ranked: CarrierOption[];
  priority: Priority;
  reason: string;
  notes: CarrierNote[];
  mode: RecommendMode | null;
}

export interface Totals {
  sumVal: number | null;
  sumCartons: number | null;
  net: number | null;
  units: number;
  wpp: number | null;
}

export interface CheckResult {
  booking: Booking;
  issues: Issue[];
  /** Rule id → plain-English reason it passed. */
  passed: Record<string, string>;
  red: number;
  amber: number;
  status: Status;
  rec: Recommendation;
  eta: Date | null;
  totals: Totals;
}

export interface CheckOptions {
  carrierOverride?: string | null;
  carriers?: Carrier[];
}
