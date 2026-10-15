import { expect, test } from '@playwright/test';

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/keyframe/']) {
      await page.goto(path);
      const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(over, `${path} at ${width}`).toBe(false);
    }
  });
}

test('reduced motion shows the final keyframe and the final caption', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.seq-caption')).toHaveText('Parts connect by contract. Select one.');
  await expect(page.locator('.inspector h3').first()).toContainText('C-05');
});

test('JavaScript disabled: every H2 and the parts list are present', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  for (const h2 of [
    'This app was built with Cognate.',
    'What Workbench is made of.',
    'Ask for the job. Any eligible part can do it.',
    'What your coding agent actually does.',
    'The agent proposes. You decide.',
    'Need something new? Authorize the agent to add it.',
    'Build your first app.',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name: h2 })).toBeVisible();
  }
  await expect(page.locator('details.parts-text li')).toHaveCount(14);
  await context.close();
});
