import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const say = async (page: Page, text: string) => {
  const input = page.getByLabel('Message', { exact: true });
  await input.fill(text);
  await input.press('Enter');
};
const NORTHFIELD = ['691200', 'UK', "that's everything", '620', 'yes'];

test('fix all safe issues, see the changes, and download them in the corrected file', async ({ page }) => {
  await page.goto('/#file');
  await expect(page.getByTestId('file-impact')).toContainText('£');
  await page.getByRole('button', { name: /Fix all safe issues \(2\)/ }).click();
  const table = page.getByTestId('bookings-table');
  await expect(table.locator('tr[data-id="BK-109"] .pill')).toHaveText('Green');
  await expect(table.locator('tr[data-id="BK-102"] .rc')).toHaveText(['R-01']); // HS code still needs a person
  const changes = page.getByTestId('changes');
  await expect(changes).toContainText('2 changes since upload');
  await changes.locator('summary').click();
  await expect(changes).toContainText('Total declared value');

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download corrected file' }).click()]);
  const wb = XLSX.read(readFileSync(await dl.path()), { type: 'buffer' });
  expect(wb.SheetNames).toEqual(['Bookings', 'Items', 'Changes']);
  expect(XLSX.utils.sheet_to_json(wb.Sheets.Changes)).toHaveLength(2);
});

test('cheaper option, dangerous-goods detail, print pack and share link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#file');
  const table = page.getByTestId('bookings-table');
  const detail = page.getByTestId('booking-detail');

  await table.locator('tr[data-id="BK-103"]').click();
  await detail.locator('.issue[data-rule="R-06"] details.dg summary').click();
  await expect(detail.locator('.issue[data-rule="R-06"] details.dg')).toContainText('UN38.3');

  await table.locator('tr[data-id="BK-105"]').click();
  await expect(detail.getByTestId('impact-note')).toContainText('£120');
  await detail.getByTestId('alternatives').getByRole('button', { name: 'Use this' }).first().click();
  await expect(table.locator('tr[data-id="BK-105"] .pill')).toHaveText('Green');

  await detail.getByRole('button', { name: 'Print documents' }).click();
  const dialog = page.getByRole('dialog', { name: 'Print documents' });
  await expect(dialog).toContainText('Carton labels');
  const [docs] = await Promise.all([context.waitForEvent('page'), dialog.getByRole('button', { name: 'Open in a new tab' }).click()]);
  await docs.waitForLoadState();
  await expect(docs.locator('body')).toContainText('Commercial invoice');
  await expect(docs.locator('section.lbl')).toHaveCount(3 + 100);
  await expect(docs.locator('section.lbl svg').first()).toBeVisible();
  await docs.close();
  await page.keyboard.press('Escape');

  await detail.getByRole('button', { name: 'Share link' }).click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/#share=/);
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByTestId('chat-log')).toContainText("I've loaded BK-105");
  await expect(other.getByTestId('chat-log')).toContainText('from a shared link');
  await expect(other.getByTestId('booking-panel').locator('#f-pal')).toHaveValue('3');
});

test('insights: scorecards, what-if and risk', async ({ page }) => {
  await page.goto('/#insights');
  const ins = page.getByTestId('insights');
  await expect(ins.getByTestId('scorecards').locator('tbody tr')).toHaveCount(9);
  await expect(ins.getByTestId('no-consolidation')).toBeVisible();
  await page.getByLabel('If').selectOption('Carrier A');
  await page.getByLabel('Price change percent').fill('30');
  await expect(ins.getByTestId('whatif-result')).toContainText('would switch carrier');
  await ins.locator('.risk').first().click();
  await expect(page.getByRole('tab', { name: 'Check a file' })).toHaveAttribute('aria-selected', 'true');
});

test('paste an order, remember it, then repeat the last booking', async ({ page }) => {
  await page.goto('/#chat');
  await page.getByRole('button', { name: 'Paste order' }).click();
  await page.getByLabel('Order text').fill("We're Northfield Goods. 3 pallets of ceramic coffee mugs from Manchester to an Amazon warehouse in Frankfurt, 1080 mugs at £5 each, 12 per carton, 0.5 kg each.\nReady 12-11-2026, cheapest please.");
  await page.getByRole('button', { name: 'Read this order' }).click();
  for (const t of NORTHFIELD) await say(page, t);
  await say(page, 'confirm');
  await expect(page.getByTestId('chat-log').getByTestId('booking-ref').last()).toHaveText(/^PF-/);

  await page.getByRole('button', { name: 'New booking', exact: true }).click();
  await page.getByRole('button', { name: /Repeat your last booking: Northfield Goods/ }).click();
  await expect(page.getByTestId('chat-log')).toContainText('Copied your last booking');
  await expect(page.getByTestId('chat-log').locator('.msg.bot').last()).toContainText('ready for collection');

  // A new booking for a saved product fills the HS code and origin itself
  await page.getByRole('button', { name: 'New booking', exact: true }).click();
  await say(page, 'Northfield Goods here, 540 ceramic coffee mugs at £5 to a warehouse in Hamburg');
  await expect(page.getByTestId('chat-log')).toContainText('filled from your saved product');
  await expect(page.getByTestId('booking-panel').locator('#f-ocity')).toHaveValue('Manchester');
});
