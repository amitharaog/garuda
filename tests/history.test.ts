import { beforeAll, describe, expect, it } from 'vitest';
import { check } from '../src/domain';
import type { Booking } from '../src/domain';
import { readFiles } from '../src/io/readWorkbook';
import { entryFor, loadHistory, recordBooking, removeBooking } from '../src/io/history';
import type { StorageLike } from '../src/io/profiles';
import { fixture, freezeToday } from './setup';

beforeAll(freezeToday);

const sample = () => readFiles([{ name: 'sample.xlsx', data: fixture('Preflight_Sample_Test_Data.xlsx') }]).bookings;
const byId = (id: string) => sample().find(b => b.id === id) as Booking;
const memory = (): StorageLike => {
  const data: Record<string, string> = {};
  return { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};

describe('booking history', () => {
  it('records what was agreed at confirmation, without the spreadsheet row', () => {
    const e = entryFor('PF-BK101-AAAA', check(byId('BK-101')), null, 'file', 1000);
    expect(e).toMatchObject({ ref: 'PF-BK101-AAAA', source: 'file', confirmedAt: 1000, cost: 540 });
    expect(e.carrier).toMatch(/^Carrier A/);
    expect(e.eta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect('_row' in e.booking).toBe(false);
  });

  it('keeps newest first, replaces by reference and removes', () => {
    const s = memory();
    const r = check(byId('BK-101'));
    recordBooking(s, entryFor('PF-1', r, null, 'chat', 1));
    recordBooking(s, entryFor('PF-2', r, null, 'chat', 2));
    expect(loadHistory(s).map(x => x.ref)).toEqual(['PF-2', 'PF-1']);
    recordBooking(s, entryFor('PF-1', r, 'Carrier C · Road express', 'chat', 3));
    expect(loadHistory(s).map(x => [x.ref, x.carrierOverride])).toEqual([['PF-1', 'Carrier C · Road express'], ['PF-2', null]]);
    expect(removeBooking(s, 'PF-2').map(x => x.ref)).toEqual(['PF-1']);
  });

  it('survives missing, broken or blocked storage', () => {
    expect(loadHistory(null)).toEqual([]);
    expect(loadHistory({ getItem: () => '{not json', setItem: () => undefined })).toEqual([]);
    const blocked: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(recordBooking(blocked, entryFor('PF-3', check(byId('BK-101')), null, 'chat')).length).toBe(1);
  });
});
