import { test, expect } from './fixtures';

test('home is the company intro; Book a shipment opens the booking page and back returns home', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Catch it before it ships/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Book by chat' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Book a shipment', exact: true }).click();
  await expect(page).toHaveURL(/#chat$/);
  await expect(page.getByRole('tab', { name: 'Book by chat' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Or try an example')).toBeVisible();
  await expect(page.locator('#hero-title')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Insights' }).click();
  await expect(page).toHaveURL(/#insights$/);

  await page.goBack();
  await expect(page.locator('#hero-title')).toBeVisible();
});

test('hero buttons open the matching console view', async ({ page }) => {
  await page.goto('/');
  await page.locator('.hero').getByRole('button', { name: 'Check a file' }).click();
  await expect(page.getByRole('tab', { name: 'Check a file' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Home' }).click();
  await expect(page.locator('#hero-title')).toBeVisible();
});

test('header lists the cities served, not the rulebook ticker', async ({ page }) => {
  await page.goto('/');
  const bar = page.getByLabel('Cities we serve');
  await expect(bar).toContainText('Manchester');
  await expect(bar).toContainText('Rotterdam');
  const header = page.locator('header.site-head');
  await expect(header.getByRole('button', { name: /rulebook|sample file/i })).toHaveCount(0);
  await expect(header).not.toContainText('ROAD FREIGHT');
});

test('confirmed bookings appear under My bookings, open in chat and can be removed', async ({ page }) => {
  await page.goto('/#bookings');
  await expect(page.getByTestId('bookings-empty')).toBeVisible();

  // confirm one booking in chat
  await page.getByRole('tab', { name: 'Book a shipment' }).click();
  await page.getByRole('button', { name: /We're Northfield Goods/ }).click();
  for (const t of ['691200', 'UK', "that's everything", '620', 'yes', 'confirm']) {
    await page.getByLabel('Message').fill(t);
    await page.getByLabel('Message').press('Enter');
  }
  const ref = (await page.getByTestId('chat-log').getByTestId('booking-ref').last().textContent()) || '';
  expect(ref).toMatch(/^PF-/);

  // and one from the sample file
  await page.getByRole('tab', { name: 'Check a file' }).click();
  await page.getByTestId('bookings-table').locator('tr[data-id="BK-101"]').click();
  await page.getByTestId('booking-detail').getByRole('button', { name: 'Confirm booking' }).click();

  await page.getByRole('tab', { name: 'My bookings' }).click();
  const rows = page.getByTestId('bookings-history').locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('from file');
  await expect(page.locator(`tr[data-ref="${ref}"]`)).toContainText('Northfield Goods');

  // survives a reload
  await page.reload();
  await expect(page.getByTestId('bookings-history').locator('tbody tr')).toHaveCount(2);

  await page.getByLabel('Search bookings').fill('frankfurt');
  await expect(page.getByTestId('bookings-history').locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('Search bookings').fill('nothing-like-this');
  await expect(page.getByTestId('bookings-history')).toHaveCount(0);
  await page.getByLabel('Search bookings').fill('');

  await page.locator(`tr[data-ref="${ref}"]`).getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('tab', { name: 'Book by chat' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('chat-log')).toContainText('from your bookings');

  await page.getByRole('tab', { name: 'My bookings' }).click();
  await page.getByRole('button', { name: `Remove ${ref}` }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByTestId('bookings-history').locator('tbody tr')).toHaveCount(1);
});

test('the upload view offers the sample file', async ({ page }) => {
  await page.goto('/#file');
  await expect(page.getByRole('button', { name: 'Use the sample file' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download sample file' })).toHaveAttribute('href', '/Preflight_Sample_Test_Data.xlsx');
});
