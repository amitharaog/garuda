import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setToday } from '../src/domain/dates';

/** Acceptance tests run with "today" frozen to 26-10-2026. */
export const TODAY = new Date(2026, 9, 26);
export const freezeToday = () => setToday(TODAY);

export const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));
