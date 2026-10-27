import { beforeAll, describe, expect, it } from 'vitest';
import { Conversation } from '../src/chat/conversation';
import type { BotMessage } from '../src/chat/conversation';
import { parseDateText, understand } from '../src/chat/understand';
import { fmtDate } from '../src/domain';
import { TODAY, freezeToday } from './setup';

beforeAll(freezeToday);

const OPENING =
  "We're Northfield Goods. 3 pallets of ceramic coffee mugs from Manchester to an Amazon warehouse in Frankfurt, 1080 mugs at £5 each, 12 per carton, 0.5 kg each. Ready 12-11-2026, cheapest please.";

const asked = (msgs: BotMessage[]) => {
  const q = msgs.filter((m): m is Extract<BotMessage, { kind: 'text' }> => m.kind === 'text' && !!m.ask);
  return q[q.length - 1];
};

describe('acceptance 3: chat flow', () => {
  const conv = new Conversation();
  const questions: string[] = [];

  it('fills what it can and asks only for what is missing, in order', () => {
    let out = conv.handle(OPENING);
    const b = conv.b;
    expect(b.seller).toBe('Northfield Goods');
    expect(b.originCity).toBe('Manchester');
    expect(b.destCity).toBe('Frankfurt');
    expect(b.destCountry).toBe('Germany'); // derived from the city
    expect(b.destType).toBe('Warehouse');
    expect(b.pallets).toBe(3);
    expect(b.readyDate).toBe('12-11-2026');
    expect(b.priority).toBe('Cheapest');
    expect(b.items).toHaveLength(1);
    const it0 = b.items[0];
    expect(it0.description).toMatch(/ceramic coffee mugs/i);
    expect([it0.qty, it0.unitPrice, it0.upc, it0.unitWeight]).toEqual([1080, 5, 12, 0.5]);
    expect(it0.cartons).toBe(90); // derived: 1080 ÷ 12
    expect(b.declaredValue).toBe(5400); // derived from the items
    expect(it0.sku).toMatch(/^[A-Z]{3,4}-01$/); // product code from the description

    questions.push(conv.pending!.field);
    expect(asked(out).html).toMatch(/691200/); // suggests the HS code
    out = conv.handle('691200');
    questions.push(conv.pending!.field);
    out = conv.handle('UK');
    questions.push(conv.pending!.field);
    out = conv.handle("that's everything");
    questions.push(conv.pending!.field);
    expect(asked(out).chips?.[0]).toMatch(/^Use estimate/); // offers an estimate
    out = conv.handle('620');
    questions.push(conv.pending!.field);
    out = conv.handle('not yet');
    expect(conv.pending).toBeNull();
    expect(questions).toEqual(['hs', 'origin', 'moreItems', 'grossWeight', 'appointment']);
  });

  it('is Amber (R-08) with Carrier A at £540', () => {
    const r = conv.result();
    expect(r.status).toBe('Amber');
    expect(r.issues.filter(i => i.severity === 'Red' || i.severity === 'Amber').map(i => i.rule)).toEqual(['R-08']);
    expect(r.rec.chosen?.c.carrier).toBe('Carrier A');
    expect(r.rec.chosen?.cost).toBe(540);
  });

  it('"add a pallet" makes it 4 pallets at £720 and shows the re-run summary', () => {
    const out = conv.handle('add a pallet');
    expect(conv.b.pallets).toBe(4);
    expect(conv.result().rec.chosen?.cost).toBe(720);
    const html = out.map(m => (m.kind === 'text' ? m.html : '')).join(' ');
    expect(html).toMatch(/Checks re-run/);
    expect(html).toMatch(/£540 → <b>Carrier A · Road economy £720/);
  });

  it('"change destination to Paris" sets France and re-runs the checks', () => {
    conv.handle('change destination to Paris');
    expect(conv.b.destCity).toBe('Paris');
    expect(conv.b.destCountry).toBe('France');
    expect(conv.result().rec.chosen?.cost).toBe(4 * 170);
  });

  it('"undo" restores the previous state', () => {
    conv.handle('undo');
    expect(conv.b.destCity).toBe('Frankfurt');
    expect(conv.b.destCountry).toBe('Germany');
    expect(conv.b.pallets).toBe(4);
  });

  it('"confirm" returns a reference starting "PF-"', () => {
    const out = conv.handle('confirm');
    const c = out.find(m => m.kind === 'confirmation');
    expect(c && c.kind === 'confirmation' && c.ref).toMatch(/^PF-/);
    expect(conv.confirmed).toMatch(/^PF-/);
  });
});

describe('mid-conversation changes', () => {
  const start = () => {
    const c = new Conversation();
    for (const t of [OPENING, '691200', 'UK', "that's everything", '620', 'not yet']) c.handle(t);
    return c;
  };

  it('"make it fastest" switches to Carrier C', () => {
    const c = start();
    c.handle('make it fastest');
    expect(c.b.priority).toBe('Fastest');
    expect(c.result().rec.chosen?.c.carrier).toBe('Carrier C');
  });

  it('"set HS code for MUG-01 to 691210" edits the item by SKU', () => {
    const c = start();
    c.b.items[0].sku = 'MUG-01';
    c.handle('set HS code for MUG-01 to 691210');
    expect(c.b.items[0].hs).toBe('691210');
  });

  it('"we\'ve booked the slot" clears R-08', () => {
    const c = start();
    c.handle("we've booked the slot");
    expect(c.b.appointment).toBe('Yes');
    expect(c.result().status).toBe('Green');
  });

  it('"use carrier B" overrides and "use the recommended" switches back', () => {
    const c = start();
    c.handle('use carrier B');
    expect(c.result().rec.chosen?.c.carrier).toBe('Carrier B');
    c.handle('use the recommended carrier');
    expect(c.result().rec.chosen?.c.carrier).toBe('Carrier A');
  });

  it('red bookings cannot be confirmed', () => {
    const c = start();
    c.handle('set declared value to 100');
    const out = c.handle('confirm');
    expect(out.some(m => m.kind === 'confirmation')).toBe(false);
    expect(c.confirmed).toBeNull();
  });

  it('"remove the hair spray" removes the matching product', () => {
    const c = new Conversation();
    c.handle('Capital Beauty here. Sending 240 bamboo hair brushes and 240 hair spray aerosols from London to a shop in Berlin');
    expect(c.b.items.map(i => i.description)).toHaveLength(2);
    c.handle('remove the hair spray');
    expect(c.b.items).toHaveLength(1);
    expect(c.b.items[0].description).toMatch(/brush/i);
  });
});

describe('understand()', () => {
  const ctx = { b: { pallets: null, cartons: null }, items: [] };
  it('reads £ amounts, kg/g and units per carton', () => {
    const u = understand('500 t-shirts at £3 each, 25 per carton, 200 g each', ctx);
    const by = (f: string) => u.sets.find(s => s.field === f)?.value;
    expect(by('unitPrice')).toBe(3);
    expect(by('upc')).toBe(25);
    expect(by('unitWeight')).toBe(0.2);
    expect(u.items[0]).toEqual({ qty: 500, description: 'T-shirts' });
  });

  it('reads dates: next Monday, tomorrow, 5 Nov', () => {
    expect(TODAY.getDay()).toBe(1); // 26-10-2026 is a Monday
    expect(fmtDate(parseDateText('next monday')!.date)).toBe('02-11-2026');
    expect(fmtDate(parseDateText('tomorrow')!.date)).toBe('27-10-2026');
    expect(fmtDate(parseDateText('5 Nov')!.date)).toBe('05-11-2026');
  });

  it('reads priorities and appointment yes/no', () => {
    expect(understand('most reliable please', ctx).sets.find(s => s.field === 'priority')?.value).toBe('Most reliable');
    expect(understand("we haven't booked a slot", ctx).sets.find(s => s.field === 'appointment')?.value).toBe('No');
  });

  it('reads multiple products', () => {
    const u = understand('120 notebooks and 300 cotton socks', ctx);
    expect(u.items.map(i => i.qty)).toEqual([120, 300]);
  });
});

describe('memory: saved products and repeat bookings', () => {
  const memory = () => {
    const data: Record<string, string> = {};
    return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
  };
  const confirmedNorthfield = () => {
    const c = new Conversation();
    for (const t of [OPENING, '691200', 'UK', "that's everything", '620', 'yes', 'confirm']) c.handle(t);
    expect(c.confirmed).toMatch(/^PF-/);
    return c.toBooking();
  };

  it('fills HS code, origin, pack size and weight from a saved product, and the usual origin city', async () => {
    const { rememberBooking } = await import('../src/io/profiles');
    const store = memory();
    const profiles = rememberBooking(store, confirmedNorthfield());
    const c = new Conversation();
    c.setMemory(profiles);
    const out = c.handle('Northfield Goods here, 540 ceramic coffee mugs at £5 to a warehouse in Hamburg');
    expect(c.b.originCity).toBe('Manchester');
    expect(c.b.items[0]).toMatchObject({ hs: '691200', origin: 'United Kingdom', upc: 12, unitWeight: 0.5 });
    expect(out.map(m => (m.kind === 'text' ? m.html : '')).join(' ')).toMatch(/filled from your saved product/);
    expect(c.pending?.field).toBe('moreItems'); // HS and origin are not asked again
  });

  it('"repeat last booking" copies it with a new reference and asks for the new date', async () => {
    const { rememberBooking } = await import('../src/io/profiles');
    const last = confirmedNorthfield();
    const c = new Conversation();
    c.setMemory(rememberBooking(memory(), last));
    const out = c.handle('repeat my last booking');
    expect(c.b.id).not.toBe(last.id);
    expect(c.b.items).toHaveLength(1);
    expect(c.b.readyDate).toBe('');
    expect(c.pending?.field).toBe('readyDate');
    expect(out[0].kind === 'text' && out[0].html).toMatch(/Copied your last booking/);
    c.handle('next monday');
    c.handle('not yet');
    expect(c.result().status).toBe('Amber');
  });

  it('says so when nothing is saved yet', () => {
    const out = new Conversation().handle('same as last time');
    expect(out[0].kind === 'text' && out[0].html).toMatch(/no earlier booking saved/);
  });

  it('reads a pasted multi-line order email', () => {
    const c = new Conversation();
    c.handle(`Hi team,

Please book the following for Pennine Textiles:
- 600 wool scarves at £6 each, 20 per carton, 0.15 kg each, made in Turkey
Collection from Birmingham, delivery to our customer's shop in Lyon.
Ready 20-11-2026, cheapest please. 1 pallet, 110 kg in total.

Thanks`);
    expect(c.b).toMatchObject({ seller: 'Pennine Textiles', originCity: 'Birmingham', destCity: 'Lyon', destType: 'Business address', readyDate: '20-11-2026', priority: 'Cheapest', pallets: 1, grossWeight: 110 });
    expect(c.b.items[0]).toMatchObject({ qty: 600, unitPrice: 6, upc: 20, unitWeight: 0.15, origin: 'Turkey', cartons: 30 });
  });
});

describe('a product line with no name', () => {
  const setup = () => {
    const c = new Conversation();
    c.handle("We're Harbour Tech. 3 pallets of power banks from London to a warehouse in Amsterdam, 20000 power banks. Ready 12-11-2026, cheapest, slot booked.");
    c.editField('hs', '340600', 0);
    c.addItemFromPanel();
    c.editField('description', 'USB cables', 1);
    c.editField('qty', 500, 1);
    return { c, out: c.editField('description', '', 0) };
  };

  it('asks for that line by number, not for "the next product"', () => {
    const { c, out } = setup();
    expect(asked(out).html).toContain('Line 1 has no product name (20,000 units, HS 340600)');
    expect(c.missingList()[0]).toBe('line 1: product name, unit price, units per carton, total cartons, unit weight, country of origin');
  });

  it('puts the answer on that line even when another line is current', () => {
    const { c } = setup();
    c.cur = 1;
    c.handle('power banks');
    expect(c.b.items.map(i => i.description)).toEqual(['Power banks', 'USB cables']);
    expect(c.b.items[0].qty).toBe(20000);
    expect(c.nextMissing()).toEqual({ field: 'unitPrice', item: 0 });
  });
});

it('a booking total before "gross weight" is not read as a product', () => {
  const u = understand('90 cartons, declared value 3400, gross weight 285 kg.', { b: null, items: [], pending: null } as never);
  expect(u.items).toEqual([]);
  expect(understand('1,080 ceramic mugs at £5 each', { b: null, items: [], pending: null } as never).items).toEqual([{ qty: 1080, description: 'Ceramic mugs' }]);
});
