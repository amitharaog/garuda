import { beforeAll, describe, expect, it } from 'vitest';
import { Conversation } from '../src/chat/conversation';
import { bestAlternative, mergeSegments, normalizeSpeech } from '../src/chat/speech';
import { freezeToday } from './setup';

beforeAll(freezeToday);

describe('normalizeSpeech', () => {
  it.each([
    ['one thousand and eighty mugs', '1080 mugs'],
    ['twenty-four boxes', '24 boxes'],
    ['a hundred and twenty units', '120 units'],
    ['two point five kilos each', '2.5 kg each'],
    ['nought point five kilograms', '0.5 kg'],
    ['half a kilo each', '0.5 kg each'],
    ['five pounds each', '£5 each'],
    ['five pounds fifty each', '£5.50 each'],
    ['3 pounds 20 each', '£3.20 each'],
    ['fifty pence each', '£0.50 each'],
    ['250 grams each', '0.25 kg each'],
    ['HS code six nine one two zero zero', 'HS code 691200'],
    ['h s code 691200', 'HS code 691200'],
    ['can you check HSN code', 'Can you check HS code'],
    ['ready on the 12th of november twenty twenty six', 'Ready on the 12th of november 2026'],
    ['this is pennine textiles 600 wool scarves', 'This is Pennine Textiles. 600 wool scarves'],
    ['ready on the twelfth of november', 'Ready on the 12th of november'],
    ['ready on the twenty first of november', 'Ready on the 21st of november'],
    ['from leads to lion', 'From Leeds to Lyon'],
    ['to a warehouse in frank fort', 'To a warehouse in Frankfurt'],
    ['from manchester to rotter dam comma cheapest please full stop', 'From Manchester to Rotterdam, cheapest please.'],
    ['three pallets', '3 pallets'],
  ])('%s → %s', (spoken, written) => {
    expect(normalizeSpeech(spoken)).toBe(written);
  });

  it('leaves words that are not quantities alone', () => {
    expect(normalizeSpeech("that's the only one")).toBe("That's the only one");
    expect(normalizeSpeech('one more product')).toBe('One more product');
    expect(normalizeSpeech('not yet')).toBe('Not yet');
    expect(normalizeSpeech('1080 mugs at £5 each')).toBe('1080 mugs at £5 each');
  });

  it('prefers the alternative that reads like a booking', () => {
    expect(bestAlternative(['from leads to lion', 'from leeds to lyon five pallets'])).toBe('from leeds to lyon five pallets');
    expect(bestAlternative(['only one'])).toBe('only one');
  });
});

describe('mergeSegments', () => {
  it('collapses revisions of the same phrase (the repeated-text bug)', () => {
    expect(mergeSegments(['check H', 'Can you check hatches', 'Can you check HSN', 'Can you check HSN code', 'Can you check HSN code'])).toBe('Can you check HSN code');
  });
  it('keeps separate phrases in order', () => {
    expect(mergeSegments(['three pallets of mugs', 'from manchester to frankfurt', 'cheapest please'])).toBe('three pallets of mugs from manchester to frankfurt cheapest please');
  });
  it('handles cumulative results', () => {
    expect(mergeSegments(['we are', 'we are northfield', 'we are northfield goods'])).toBe('we are northfield goods');
  });
});

describe('a spoken booking fills the same fields as the typed one', () => {
  it('reads an unpunctuated dictated opening', () => {
    const conv = new Conversation();
    conv.handle(normalizeSpeech(
      "we're northfield goods three pallets of ceramic coffee mugs from manchester to an amazon warehouse in frankfurt one thousand and eighty mugs at five pounds each twelve per carton half a kilo each ready on the twelfth of november twenty twenty six cheapest please",
    ));
    const b = conv.b;
    expect(b.seller).toBe('Northfield Goods');
    expect([b.originCity, b.destCity, b.destType, b.pallets, b.priority]).toEqual(['Manchester', 'Frankfurt', 'Warehouse', 3, 'Cheapest']);
    expect(b.readyDate).toBe('12-11-2026');
    expect(b.items).toHaveLength(1);
    const it0 = b.items[0];
    expect([it0.qty, it0.unitPrice, it0.upc, it0.unitWeight]).toEqual([1080, 5, 12, 0.5]);
  });

  it('answers follow-up questions by voice', () => {
    const conv = new Conversation();
    conv.handle(normalizeSpeech('we are northfield goods three pallets of ceramic coffee mugs from manchester to an amazon warehouse in frankfurt one thousand and eighty mugs at five pounds each twelve per carton half a kilo each ready on the twelfth of november cheapest please'));
    conv.handle(normalizeSpeech('six nine one two zero zero'));
    expect(conv.b.items[0].hs).toBe('691200');
  });

  it('reads a second dictated booking', () => {
    const conv = new Conversation();
    conv.handle(normalizeSpeech('i need to send five hundred cotton t-shirts at three pounds each from leads to a shop in lion fastest option'));
    const b = conv.b;
    expect([b.originCity, b.destCity, b.destCountry, b.priority]).toEqual(['Leeds', 'Lyon', 'France', 'Fastest']);
    expect([b.items[0].qty, b.items[0].unitPrice]).toEqual([500, 3]);
  });
});
