/* Fixed reference data: Sheets 3 (Carrier options) and 4 (Rulebook) of the judges' template, copied exactly. */
import type { Carrier, RuleSeverity, Priority } from './types';

export const CARRIERS: readonly Carrier[] = [
  { carrier: 'Carrier A', service: 'Road economy', origin: 'United Kingdom', dest: 'Germany', price: 180, transit: 5, ontime: 92, maxKg: 500 },
  { carrier: 'Carrier B', service: 'Road standard', origin: 'United Kingdom', dest: 'Germany', price: 220, transit: 3, ontime: 95, maxKg: 750 },
  { carrier: 'Carrier C', service: 'Road express', origin: 'United Kingdom', dest: 'Germany', price: 340, transit: 2, ontime: 98, maxKg: 400 },
  { carrier: 'Carrier A', service: 'Road economy', origin: 'United Kingdom', dest: 'France', price: 170, transit: 5, ontime: 92, maxKg: 500 },
  { carrier: 'Carrier B', service: 'Road standard', origin: 'United Kingdom', dest: 'France', price: 210, transit: 3, ontime: 95, maxKg: 750 },
  { carrier: 'Carrier C', service: 'Road express', origin: 'United Kingdom', dest: 'France', price: 330, transit: 2, ontime: 98, maxKg: 400 },
  { carrier: 'Carrier A', service: 'Road economy', origin: 'United Kingdom', dest: 'Netherlands', price: 160, transit: 5, ontime: 92, maxKg: 500 },
  { carrier: 'Carrier B', service: 'Road standard', origin: 'United Kingdom', dest: 'Netherlands', price: 200, transit: 3, ontime: 95, maxKg: 750 },
  { carrier: 'Carrier C', service: 'Road express', origin: 'United Kingdom', dest: 'Netherlands', price: 320, transit: 2, ontime: 98, maxKg: 400 },
];

export interface Rule {
  id: string;
  text: string;
  severity: RuleSeverity;
}

export const RULES: readonly Rule[] = [
  { id: 'R-01', text: 'Every item must have an HS code of at least 6 digits', severity: 'Red' },
  { id: 'R-02', text: 'Total declared value must equal the sum of quantity × unit price across all items (within 1%)', severity: 'Red' },
  { id: 'R-03', text: 'For each item, units per carton × cartons must equal quantity', severity: 'Red' },
  { id: 'R-04', text: 'Total cartons on the booking must equal the sum of cartons across all items', severity: 'Red' },
  { id: 'R-05', text: "Weight per pallet (total gross weight ÷ pallets) must not exceed the chosen carrier's max weight per pallet", severity: 'Red' },
  { id: 'R-06', text: 'No lithium batteries, aerosols or flammable liquids', severity: 'Red' },
  { id: 'R-07', text: 'Total gross weight must be at least the sum of unit weight × quantity across all items', severity: 'Amber' },
  { id: 'R-08', text: 'Shipments to a warehouse must have a delivery appointment booked', severity: 'Amber' },
  { id: 'R-09', text: 'Every item must have a country of origin', severity: 'Amber' },
  { id: 'R-10', text: 'Ready to ship date must not be in the past', severity: 'Amber' },
];

export const RULE: Readonly<Record<string, Rule>> = Object.fromEntries(RULES.map(r => [r.id, r]));

export const PRIORITIES: readonly Priority[] = ['Cheapest', 'Fastest', 'Most reliable', 'Balanced'];

export const ALLOWED = {
  originCountry: ['United Kingdom'],
  originCity: ['London', 'Manchester', 'Birmingham', 'Leeds'],
  destCountry: ['Germany', 'France', 'Netherlands'],
  destCities: { Germany: ['Berlin', 'Frankfurt', 'Hamburg'], France: ['Paris', 'Lyon'], Netherlands: ['Amsterdam', 'Rotterdam'] } as Record<string, string[]>,
  destType: ['Warehouse', 'Business address'],
  priority: PRIORITIES as readonly string[],
  currency: ['GBP'],
  itemOrigin: ['United Kingdom', 'China', 'India', 'Vietnam', 'Turkey', 'Germany'],
  yesNo: ['Yes', 'No'],
} as const;

export const CITY_TO_COUNTRY: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ALLOWED.destCities).flatMap(([country, cities]) => cities.map(city => [city, country])),
);

export const COUNTRY_CODE: Readonly<Record<string, string>> = { Germany: 'DE', France: 'FR', Netherlands: 'NL' };

/** What each rule protects against (shown on the Rules tab). */
export const PROTECTS: Readonly<Record<string, string>> = {
  'R-01': 'Customs', 'R-02': 'Customs', 'R-03': 'Warehouse count', 'R-04': 'Warehouse count', 'R-05': 'Carrier',
  'R-06': 'Carrier / safety', 'R-07': 'Carrier / customs', 'R-08': 'Warehouse', 'R-09': 'Customs', 'R-10': 'Collection',
};

export const BOOKING_FIELDS = [
  { key: 'id', label: 'Booking ID' },
  { key: 'seller', label: 'Seller name' },
  { key: 'originCity', label: 'Origin city' },
  { key: 'originCountry', label: 'Origin country' },
  { key: 'destCity', label: 'Destination city' },
  { key: 'destCountry', label: 'Destination country' },
  { key: 'destType', label: 'Destination type' },
  { key: 'readyDate', label: 'Ready to ship date' },
  { key: 'priority', label: 'Seller priority' },
  { key: 'pallets', label: 'Pallets' },
  { key: 'cartons', label: 'Cartons' },
  { key: 'declaredValue', label: 'Total declared value' },
  { key: 'currency', label: 'Currency' },
  { key: 'grossWeight', label: 'Total gross weight (kg)' },
  { key: 'appointment', label: 'Delivery appointment booked' },
] as const;

export const ITEM_FIELDS = [
  { key: 'bookingId', label: 'Booking ID' },
  { key: 'sku', label: 'SKU' },
  { key: 'description', label: 'Description' },
  { key: 'hs', label: 'HS code' },
  { key: 'qty', label: 'Quantity (units)' },
  { key: 'unitPrice', label: 'Unit price' },
  { key: 'upc', label: 'Units per carton' },
  { key: 'cartons', label: 'Cartons' },
  { key: 'unitWeight', label: 'Unit weight (kg)' },
  { key: 'origin', label: 'Country of origin' },
] as const;
