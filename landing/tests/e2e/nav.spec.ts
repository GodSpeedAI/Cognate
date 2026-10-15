import { expect, test } from '@playwright/test';

const anchors = ['#proof', '#parts', '#fit', '#build', '#operate', '#extend', '#start'];

test('every nav anchor and CTA lands on its section', async ({ page }) => {
  await page.goto('/');
  for (const hash of anchors) {
    await page.locator(`a[href="${hash}"]:not(.skip)`).first().click();
    await expect(page).toHaveURL(new RegExp(`${hash}$`));
    const top = await page.locator(hash).evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThan(200);
  }
});

test('the progress rail marks the current beat', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#fit');
  await expect(page.locator('.rail a[aria-current="step"]')).toHaveCount(1);
});
