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

test('reduced motion: Sequence C shows its final caption at once, with no scrubbing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#parts');
  // The island hydrates when it enters the viewport, so wait for the section to be on screen.
  await page.locator('[data-sequence="C"]').scrollIntoViewIfNeeded();
  await expect(page.locator('.seq-caption')).toHaveText('Parts connect by contract. Select one.');
});

test('reduced motion: C-05 is selected in the final state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#parts');
  await expect(page.locator('[data-sequence="C"] [data-testid="inspector"]')).toContainText('C-05');
});

test('JavaScript disabled: H2s, parts list and onboarding text are visible', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  for (const h2 of [
    'This app was built with Cognate.',
    'What Workbench is made of.',
    'Ask for the job by name, not for the code that does it.',
    'What your coding agent actually does.',
    'The agent proposes. You decide.',
    'Need something new? Authorize the agent to add it.',
    'Build your first app.',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name: h2 })).toBeVisible();
  }
  await expect(page.locator('details.parts-text ol.parts > li')).toHaveCount(14);
  await expect(page.getByText('Check it yourself.')).toBeVisible();
  await expect(page.getByText('bun test', { exact: true }).first()).toBeVisible();
  await context.close();
});
