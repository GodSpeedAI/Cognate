import { expect, test } from '@playwright/test';

// Selectors owned by the exploded-view component: [data-part-id] buttons and [data-testid="inspector"].
const part = (id: string) => `[data-part-id="${id}"]`;

test.describe('desktop selection', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('mouse click changes the inspector; arrows move; Escape closes', async ({ page }) => {
    await page.goto('/keyframe/');
    await page.locator(part('C-01')).filter({ visible: true }).first().click();
    await expect(page.getByTestId('inspector')).toContainText('C-01');
    await page.locator(part('C-01')).filter({ visible: true }).first().press('ArrowRight');
    await expect(page.getByTestId('inspector')).toContainText('C-02');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('inspector')).not.toContainText('Depends on');
  });

  test('keyboard: Tab reaches a part and Enter selects it', async ({ page }) => {
    await page.goto('/keyframe/');
    await page.locator(part('C-03')).filter({ visible: true }).first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('inspector')).toContainText('C-03');
  });

  test('"Show the code" reveals an excerpt and a GitHub link at a full SHA', async ({ page }) => {
    await page.goto('/keyframe/');
    await page.getByTestId('inspector').locator('summary', { hasText: 'Show the code' }).click();
    await expect(page.getByTestId('inspector').locator('pre').first()).toBeVisible();
    const href = await page.getByTestId('inspector').locator('a[href*="github.com"]').first().getAttribute('href');
    expect(href).toMatch(/^https:\/\/github\.com\/GodSpeedAI\/Cognate(-Workbench)?\/blob\/[0-9a-f]{40}\/.+#L\d+-L\d+$/);
  });
});

test.describe('touch on mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('tapping a part opens the inspector sheet', async ({ page }) => {
    await page.goto('/keyframe/');
    await page.locator(part('C-02')).filter({ visible: true }).first().tap();
    await expect(page.getByTestId('inspector')).toContainText('C-02');
  });
});
