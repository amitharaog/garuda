import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const OPENING =
  "We're Northfield Goods. 3 pallets of ceramic coffee mugs from Manchester to an Amazon warehouse in Frankfurt, 1080 mugs at £5 each, 12 per carton, 0.5 kg each. Ready 12-11-2026, cheapest please.";

async function say(page: Page, text: string) {
  const input = page.getByLabel('Message');
  await input.fill(text);
  await input.press('Enter');
}

test('chat flow: asks only for what is missing, re-runs checks, undo and confirm', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Book by chat' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Or try an example')).toBeVisible();

  const log = page.getByTestId('chat-log');
  const panel = page.getByTestId('booking-panel');

  await say(page, OPENING);
  await expect(log.locator('.msg.bot').last()).toContainText('HS code');
  await expect(log.locator('.msg.bot').last()).toContainText('691200');
  await expect(panel.locator('#f-seller')).toHaveValue('Northfield Goods');
  await expect(panel.locator('#f-dctry')).toHaveValue('Germany');

  // Tap-to-answer chip for the suggested HS code
  await log.getByRole('button', { name: 'Use 691200' }).click();
  await expect(log.locator('.msg.bot').last()).toContainText('made');
  await say(page, 'UK');
  await expect(log.locator('.msg.bot').last()).toContainText('only product');
  await log.getByRole('button', { name: "That's everything" }).last().click();
  await expect(log.locator('.msg.bot').last()).toContainText('gross weight');
  await expect(log.getByRole('button', { name: /Use estimate/ })).toBeVisible();
  await say(page, '620');
  await expect(log.locator('.msg.bot').last()).toContainText('delivery time slot');
  await say(page, 'not yet');

  await expect(panel.getByTestId('status-pill')).toHaveText('Amber');
  await expect(panel.locator('.issue[data-rule="R-08"]')).toBeVisible();
  await expect(panel.getByTestId('carrier-cost')).toHaveText('£540');
  await expect(panel.locator('.ccard.chosen')).toContainText('Carrier A');

  await say(page, 'add a pallet');
  await expect(log.locator('.msg.bot').filter({ hasText: 'Checks re-run' }).last()).toContainText('£720');
  await expect(panel.locator('#f-pal')).toHaveValue('4');
  await expect(panel.getByTestId('carrier-cost')).toHaveText('£720');

  await say(page, 'change destination to Paris');
  await expect(panel.locator('#f-dctry')).toHaveValue('France');
  await expect(panel.getByTestId('carrier-cost')).toHaveText('£680');

  await say(page, 'undo');
  await expect(panel.locator('#f-dcity')).toHaveValue('Frankfurt');
  await expect(panel.locator('#f-dctry')).toHaveValue('Germany');

  await say(page, 'confirm');
  await expect(log.getByTestId('booking-ref').last()).toHaveText(/^PF-/);
  await expect(panel.getByRole('button', { name: 'Confirmed ✓' })).toBeVisible();
});

test('panel edits flow back into the chat, and red bookings cannot be confirmed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /We're Northfield Goods/ }).click();
  for (const t of ['691200', 'UK', "that's everything", '620', 'yes']) await say(page, t);
  const panel = page.getByTestId('booking-panel');
  await expect(panel.getByTestId('status-pill')).toHaveText('Green');

  const value = panel.locator('#f-val');
  await value.fill('3000');
  await value.press('Enter');
  await expect(page.getByTestId('chat-log')).toContainText('in the panel: declared value: £5,400 → £3,000');
  await expect(panel.getByTestId('status-pill')).toHaveText('Red');
  await expect(panel.getByRole('button', { name: 'Confirm booking' })).toBeDisabled();

  await panel.locator('.issue[data-rule="R-02"]').getByRole('button', { name: 'Set declared value to £5,400' }).click();
  await expect(panel.getByTestId('status-pill')).toHaveText('Green');

  await panel.getByRole('button', { name: 'Invoice draft' }).click();
  const dialog = page.getByRole('dialog', { name: 'Commercial invoice draft' });
  await expect(dialog).toContainText('INV-');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
