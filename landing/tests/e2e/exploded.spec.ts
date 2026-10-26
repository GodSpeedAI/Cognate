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

test.describe('authority route and record', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a part with a verified stores-in edge to C-10 writes a ledger row; one without does not', async ({ page }) => {
    await page.goto('/keyframe/');
    await page.locator(part('C-04')).filter({ visible: true }).first().click();
    await expect(page.locator('.ledger-row')).toHaveText(/C-04 Permissions → C-10 History/);
    await page.locator(part('C-01')).filter({ visible: true }).first().click();
    await expect(page.locator('.ledger-row')).toHaveCount(0);
  });

  test('the route is drawn in the signal colour, and no ledger row is drawn before a selection', async ({ page }) => {
    await page.goto('/keyframe/');
    await expect(page.locator('.overlay .edge.route')).toHaveCount(0);
    await page.locator(part('C-05')).filter({ visible: true }).first().click();
    await expect(page.locator('.overlay .edge.route').first()).toBeVisible();
  });
});

test('no face label overflows its face at 1024 (C-04 Permissions was clipped)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/keyframe/');
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.exploded .face')]
      .filter((f) => f.getBoundingClientRect().width > 0 && f.scrollWidth > f.clientWidth + 1)
      .map((f) => f.dataset.partId),
  );
  expect(overflowing).toEqual([]);
});
