import { expect, test } from '@playwright/test';

test('composition demo: mallory is denied before anything runs', async ({ page }) => {
  await page.goto('/#fit');
  await page.getByRole('radio', { name: 'mallory' }).check();
  await expect(page.locator('.demo-result')).toContainText('Denied by policy before anything ran.');
});

test('run strip: approve completes the refund; deny does not', async ({ page }) => {
  await page.goto('/#operate');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.run-strip')).toContainText('run.completed');
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: 'Deny' }).click();
  await expect(page.locator('.run-strip')).toContainText('run.completed (no refund)');
});
