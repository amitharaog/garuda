import { test, expect } from './fixtures';

for (const view of ['chat', 'file', 'rules']) {
  test(`no horizontal page scroll on the ${view} tab`, async ({ page }) => {
    await page.goto(`/#${view}`);
    if (view === 'chat') {
      await page.getByRole('button', { name: /We're Northfield Goods/ }).click();
      for (const t of ['691200', 'UK', "that's everything", '620', 'not yet']) {
        await page.getByLabel('Message').fill(t);
        await page.getByLabel('Message').press('Enter');
      }
      await expect(page.getByTestId('status-pill')).toHaveText('Amber');
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('keyboard focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe('none');
});
