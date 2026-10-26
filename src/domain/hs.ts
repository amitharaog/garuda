/* HS codes: digit counting, text normalisation and description-based suggestions (a helper only; the seller confirms). */
import { blank } from './format';

/** Keep HS codes as text. Numbers from Excel lose their ".0". */
export function normHS(v: unknown): string {
  if (blank(v)) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v).replace(/\.0+$/, '');
  return String(v).trim();
}

export const hsDigits = (hs: string | null | undefined): string => String(hs || '').replace(/\D/g, '');

const HS_HINTS: ReadonlyArray<[RegExp, string, string]> = [
  [/porcelain|bone china/i, '691110', 'Porcelain tableware/kitchenware'],
  [/mug|ceramic|stoneware|earthenware|plate|bowl/i, '691200', 'Ceramic tableware (not porcelain)'],
  [/t-?shirt|tee\b/i, '610910', 'T-shirts, cotton, knitted'],
  [/hoodie|sweatshirt|jumper|sweater|pullover/i, '611020', 'Jerseys/pullovers, cotton, knitted'],
  [/jeans|denim/i, '620342', "Trousers, cotton (men's)"],
  [/sock/i, '611595', 'Socks, cotton'],
  [/scarf|scarves/i, '611710', 'Shawls/scarves, knitted'],
  [/candle/i, '340600', 'Candles'],
  [/notebook|notepad|journal|diary/i, '482010', 'Notebooks, diaries'],
  [/\bbook/i, '490199', 'Printed books'],
  [/jigsaw|puzzle|toy|teddy|plush|doll/i, '950300', 'Toys and puzzles'],
  [/yoga mat|dumbbell|kettlebell|fitness/i, '950691', 'Gym/fitness equipment'],
  [/trainer|sneaker|shoe|boot/i, '640411', 'Footwear, textile uppers'],
  [/backpack|rucksack/i, '420292', 'Bags, textile/plastic outer'],
  [/handbag|tote/i, '420222', 'Handbags, textile/plastic outer'],
  [/wallet|purse/i, '420232', 'Wallets/purses'],
  [/sunglass/i, '900410', 'Sunglasses'],
  [/headphone|earphone|earbud/i, '851830', 'Headphones/earphones'],
  [/phone case|phone cover/i, '392690', 'Other articles of plastic'],
  [/water bottle|flask|tumbler/i, '732393', 'Stainless steel household articles'],
  [/glass(es)?\b|tumbler glass|wine glass/i, '701337', 'Drinking glasses'],
  [/cutlery|spoon|fork|knife|knives/i, '821599', 'Cutlery'],
  [/towel/i, '630260', 'Toilet/kitchen linen, cotton terry'],
  [/bed ?sheet|duvet cover|bed linen|pillowcase/i, '630231', 'Bed linen, cotton'],
  [/cushion|pillow/i, '940490', 'Cushions/pillows'],
  [/chair|table|desk|shelf|shelves|cabinet|stool/i, '940360', 'Wooden furniture'],
  [/\btea\b/i, '090230', 'Black tea'],
  [/coffee bean|ground coffee|\bcoffee\b/i, '090121', 'Roasted coffee'],
  [/chocolate/i, '180632', 'Chocolate'],
  [/biscuit|cookie/i, '190531', 'Sweet biscuits'],
  [/soap/i, '340111', 'Soap'],
  [/shampoo/i, '330510', 'Shampoo'],
  [/bicycle|bike\b/i, '871200', 'Bicycles'],
  [/watch/i, '910211', 'Wrist watches'],
  [/lamp|light fitting/i, '940520', 'Electric table/desk lamps'],
];

export interface HSSuggestion {
  code: string;
  label: string;
}

export function suggestHS(desc: string | null | undefined): HSSuggestion | null {
  for (const [re, code, label] of HS_HINTS) if (re.test(desc || '')) return { code, label };
  return null;
}

/** A 5-digit code that probably lost its leading zero in Excel (e.g. 90230 → 090230). */
export const leadingZeroHint = (hs: string): string | null => {
  const d = hsDigits(hs);
  return d.length === 5 ? '0' + d : null;
};
