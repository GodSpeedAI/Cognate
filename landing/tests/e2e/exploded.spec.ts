import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

test('selection by mouse and keyboard, and the inspector changes', async ({ page }) => {
  await page.goto('/keyframe/');
  await page.waitForSelector('[data-measured="true"]');
  await expect(page.locator('.inspector h3').first()).toContainText('C-05');
  await page.locator('.tag[data-part="C-01"]').click();
  await expect(page.locator('.inspector h3').first()).toContainText('C-01');
  await page.locator('.tag[data-part="C-01"]').press('ArrowRight');
  await expect(page.locator('.inspector h3').first()).toContainText('C-02');
  await page.keyboard.press('Escape');
  await expect(page.locator('.inspector[data-open]').first()).toBeVisible();
});

test('"Show the code" reveals an excerpt and a GitHub link at a full SHA', async ({ page }) => {
  await page.goto('/keyframe/');
  await page.waitForSelector('[data-measured="true"]');
  await page.locator('details.code summary').first().click();
  await expect(page.locator('details.code pre').first()).toBeVisible();
  const href = await page.locator('details.code a').first().getAttribute('href');
  expect(href).toMatch(/^https:\/\/github\.com\/GodSpeedAI\/Cognate(-Workbench)?\/blob\/[0-9a-f]{40}\/.+#L\d+-L\d+$/);
});
