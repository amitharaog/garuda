import { test as base, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/** Every e2e test runs with "today" frozen to 26-10-2026. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date('2026-10-26T10:00:00'));
    await use(page);
  },
});
export { expect };

export const fixturePath = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
