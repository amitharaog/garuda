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

test('the upload view offers the sample file', async ({ page }) => {
  await page.goto('/#file');
  await expect(page.getByRole('button', { name: 'Use the sample file' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download sample file' })).toHaveAttribute('href', '/Preflight_Sample_Test_Data.xlsx');
});
