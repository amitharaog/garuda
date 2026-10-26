import { test, expect, fixturePath } from './fixtures';

const EXPECTED: Record<string, [string, string[]]> = {
  'BK-101': ['Green', []],
  'BK-102': ['Red', ['R-01', 'R-02']],
  'BK-103': ['Red', ['R-06', 'R-08']],
  'BK-104': ['Red', ['R-03', 'R-04']],
  'BK-105': ['Red', ['R-05']],
  'BK-106': ['Amber', ['R-07', 'R-09']],
  'BK-107': ['Red', ['R-06', 'R-10']],
  'BK-108': ['Green', ['R-05']], // R-05 notice: switched carrier
  'BK-109': ['Red', ['R-01']],
};

test('upload the sample workbook: statuses, rule chips, counts and freight total', async ({ page }) => {
  await page.goto('/#file');
  await page.getByTestId('file-input').setInputFiles(fixturePath('Preflight_Sample_Test_Data.xlsx'));
  const summary = page.getByTestId('file-summary');
  await expect(summary).toContainText('Preflight_Sample_Test_Data.xlsx');
  await expect(summary.locator('.stat').nth(0)).toContainText('9');
  await expect(summary.locator('.stat.r')).toContainText('6');
  await expect(summary.locator('.stat.a')).toContainText('1');
  await expect(summary.locator('.stat.g')).toContainText('2');
  await expect(page.getByTestId('file-warnings')).toContainText('example row (BK-001)');

  const table = page.getByTestId('bookings-table');
  for (const [id, [status, rules]] of Object.entries(EXPECTED)) {
    const row = table.locator(`tr[data-id="${id}"]`);
    await expect(row.locator('.pill')).toHaveText(status);
    await expect(row.locator('.rc')).toHaveText(rules);
  }
  await expect(table.locator('tr[data-id="BK-108"] .rc.Notice')).toHaveText('R-05');

  await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Amber/ }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
});

test('the untouched template gives zero bookings and the skipped-example notice', async ({ page }) => {
  await page.goto('/#file');
  await page.getByTestId('file-input').setInputFiles(fixturePath('Case2_Shipment_Booking_Test_Data_Format.xlsx'));
  await expect(page.getByTestId('file-summary')).toContainText('No bookings found');
  await expect(page.getByTestId('file-warnings')).toContainText("skipped row 3, the template's grey example row (BK-001)");
});

test('one-click fixes, carrier override, confirm, and Fix in chat syncing back', async ({ page }) => {
  await page.goto('/#file');
  const table = page.getByTestId('bookings-table');
  const detail = page.getByTestId('booking-detail');

  await table.locator('tr[data-id="BK-102"]').click();
  await detail.getByRole('button', { name: 'Set declared value to £3,660' }).click();
  await detail.getByRole('button', { name: 'Use suggested 340600' }).click();
  await expect(table.locator('tr[data-id="BK-102"] .pill')).toHaveText('Green');

  await detail.locator('.ccard[data-carrier="Carrier C"]').getByRole('button', { name: 'Use Carrier C' }).click();
  await expect(detail.locator('.carrier-pick')).toContainText('Your chosen carrier');
  await detail.getByRole('button', { name: 'Back to the recommended carrier' }).click();
  await detail.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(table.locator('tr[data-id="BK-102"]')).toContainText('booked');

  // BK-103: remove the power bank in chat, then go back to the file
  await table.locator('tr[data-id="BK-103"]').click();
  await detail.getByRole('button', { name: 'Fix in chat' }).click();
  await expect(page.getByRole('tab', { name: 'Book by chat' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('chat-log')).toContainText("I've loaded BK-103");
  const input = page.getByLabel('Message');
  await input.fill('remove the power bank');
  await input.press('Enter');
  await input.fill("we've booked the slot");
  await input.press('Enter');
  await expect(page.getByTestId('booking-panel').getByTestId('status-pill')).toHaveText('Green');
  await page.getByRole('button', { name: 'Back to file results' }).click();
  await expect(table.locator('tr[data-id="BK-103"] .pill')).toHaveText('Green');
});

test('downloads the corrected workbook and the issues report', async ({ page }) => {
  await page.goto('/#file');
  const [fixed] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download corrected file' }).click()]);
  expect(fixed.suggestedFilename()).toBe('garuda-corrected-bookings.xlsx');
  const [report] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download issues report' }).click()]);
  expect(report.suggestedFilename()).toBe('garuda-issues-report.xlsx');
});

test('rules tab has the rulebook and no rate card', async ({ page }) => {
  await page.goto('/#rules');
  await expect(page.getByTestId('rulebook').locator('tbody tr')).toHaveCount(10);
  await expect(page.locator('#view-rules')).not.toContainText('Price per pallet');
});
