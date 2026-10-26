/* The 9 sample bookings with planted mistakes. Same content as Preflight_Sample_Test_Data.xlsx (rows 4+). */
import type { RawBooking, RawItem } from '../domain/types';

type B = [string, string, string, string, string, string, string, string, string, number, number, number, string, number, string];
type I = [string, string, string, number | string | null, number, number, number, number, number, string | null];

const UK = 'United Kingdom';
const BOOKINGS: B[] = [
  ['BK-101', 'Northfield Goods', 'Manchester', UK, 'Frankfurt', 'Germany', 'Warehouse', '12-11-2026', 'Cheapest', 3, 90, 5400, 'GBP', 620, 'Yes'],
  ['BK-102', 'Bright Wick Candles', 'Leeds', UK, 'Lyon', 'France', 'Business address', '16-11-2026', 'Balanced', 2, 40, 3500, 'GBP', 310, 'No'],
  ['BK-103', 'Harbour Tech Ltd', 'London', UK, 'Amsterdam', 'Netherlands', 'Warehouse', '18-11-2026', 'Fastest', 2, 60, 9600, 'GBP', 380, 'No'],
  ['BK-104', 'Pennine Textiles', 'Birmingham', UK, 'Hamburg', 'Germany', 'Warehouse', '20-11-2026', 'Cheapest', 2, 50, 4800, 'GBP', 420, 'Yes'],
  ['BK-105', 'Midland Ceramics', 'Birmingham', UK, 'Paris', 'France', 'Warehouse', '23-11-2026', 'Most reliable', 2, 100, 6000, 'GBP', 1700, 'Yes'],
  ['BK-106', 'Leeds Home Co', 'Leeds', UK, 'Rotterdam', 'Netherlands', 'Business address', '25-11-2026', 'Balanced', 1, 30, 2400, 'GBP', 150, 'No'],
  ['BK-107', 'Capital Beauty', 'London', UK, 'Berlin', 'Germany', 'Warehouse', '15-10-2026', 'Fastest', 1, 30, 1440, 'GBP', 190, 'Yes'],
  ['BK-108', 'Kestrel Outdoor', 'Manchester', UK, 'Frankfurt', 'Germany', 'Warehouse', '27-11-2026', 'Cheapest', 3, 75, 9000, 'GBP', 1650, 'Yes'],
  ['BK-109', 'Thistle Tea Co', 'London', UK, 'Paris', 'France', 'Business address', '30-11-2026', 'Most reliable', 1, 40, 4000, 'GBP', 260, 'No'],
];
const ITEMS: I[] = [
  ['BK-101', 'MUG-01', 'Ceramic coffee mug, 350 ml', 691200, 1080, 5, 12, 90, 0.5, UK],
  ['BK-102', 'CDL-01', 'Scented soy candle, 200 g', null, 480, 4.5, 24, 20, 0.3, 'China'],
  ['BK-102', 'TSH-01', 'Cotton t-shirt, printed', 610910, 500, 3, 25, 20, 0.2, 'India'],
  ['BK-103', 'CBL-01', 'USB-C charging cable, 1 m', 854442, 1200, 4, 40, 30, 0.05, 'China'],
  ['BK-103', 'PWB-01', 'Lithium-ion power bank 10,000 mAh', 850760, 600, 8, 20, 30, 0.25, 'China'],
  ['BK-104', 'SCF-01', 'Wool scarf, checked', 611720, 600, 6, 20, 32, 0.15, 'Turkey'],
  ['BK-104', 'GLV-01', 'Knitted gloves', 611693, 400, 3, 20, 20, 0.1, 'Turkey'],
  ['BK-105', 'PLT-01', 'Stoneware dinner plate', 691200, 1200, 5, 12, 100, 1.2, UK],
  ['BK-106', 'CSH-01', 'Linen cushion cover', 630492, 600, 4, 20, 30, 0.5, null],
  ['BK-107', 'HSP-01', 'Hair spray aerosol, 300 ml', 330530, 240, 3, 12, 20, 0.35, 'Germany'],
  ['BK-107', 'BRS-01', 'Bamboo hair brush', 96032930, 240, 3, 24, 10, 0.12, 'Vietnam'],
  ['BK-108', 'TNT-01', 'Two-person camping tent', 630622, 300, 30, 4, 75, 5, 'Vietnam'],
  ['BK-109', 'TEA-01', 'Loose leaf black tea, 250 g', 90230, 800, 5, 20, 40, 0.28, 'India'],
];

export const SAMPLE_NAME = 'Sample file (planted mistakes)';

/** Sheet-shaped rows (as they would come out of the workbook, starting at row 4). */
export const SAMPLE_BOOKING_ROWS: Array<RawBooking & { _row: number }> = BOOKINGS.map((r, i) => ({
  _row: i + 4, id: r[0], seller: r[1], originCity: r[2], originCountry: r[3], destCity: r[4], destCountry: r[5], destType: r[6], readyDate: r[7],
  priority: r[8], pallets: r[9], cartons: r[10], declaredValue: r[11], currency: r[12], grossWeight: r[13], appointment: r[14],
}));
export const SAMPLE_ITEM_ROWS: Array<RawItem & { _row: number }> = ITEMS.map((r, i) => ({
  _row: i + 4, bookingId: r[0], sku: r[1], description: r[2], hs: r[3], qty: r[4], unitPrice: r[5], upc: r[6], cartons: r[7], unitWeight: r[8], origin: r[9],
}));
