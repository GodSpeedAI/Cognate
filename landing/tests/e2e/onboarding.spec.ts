import { expect, test } from '@playwright/test';

test('copy buttons write the command to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission is granted for chromium only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#start');
  await page.locator('#ob-check').getByRole('button', { name: 'Copy' }).click();
  await expect(page.locator('#ob-check .copy-status')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('bun test');
});

test('progress persists across reload and Reset clears it', async ({ page }) => {
  await page.goto('/#start');
  await page.locator('#ob-tools').getByRole('checkbox').check();
  await page.reload();
  await expect(page.locator('#ob-tools').getByRole('checkbox')).toBeChecked();
  await expect(page.locator('.progress p').first()).toHaveText('1 of 4 steps checked.');
  await page.getByRole('button', { name: 'Reset progress' }).click();
  await expect(page.locator('#ob-tools').getByRole('checkbox')).not.toBeChecked();
});
