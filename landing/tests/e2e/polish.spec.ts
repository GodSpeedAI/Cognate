import { expect, test } from '@playwright/test';

// Beat F: the escalate state is amber (Escalate), not Allow green; the run starts at its gate; controls are enabled
// once the island has mounted.
test('decision node escalate state is Escalate amber and the controls are live after load', async ({ page }) => {
  await page.goto('/#operate');
  const node = page.locator('.decision-node');
  await expect(node).toHaveAttribute('data-phase', 'escalate');
  await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
  const border = await node.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(border).toBe('rgb(138, 92, 18)');
  const gate = await page.locator('.run-strip li.gate').evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(gate).toBe('rgb(138, 92, 18)');
});

test('without JavaScript the decision controls are disabled and explained, not inert', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/#operate');
  await expect(page.locator('.decision-node')).toHaveAttribute('data-phase', 'escalate');
  await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Deny' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
  await expect(page.locator('#operate .demo-note')).toContainText('Until then the run is shown at its approval gate.');
  await context.close();
});

// Copy sits in the command block's own top bar, as a labelled 44px target.
test('each command block has its Copy button inside the block, 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#start');
  const blocks = page.locator('#start .code-block');
  const count = await blocks.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < count; i += 1) {
    const block = blocks.nth(i);
    const button = block.locator('.code-bar button', { hasText: 'Copy' });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    const outer = await block.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(outer!.x + outer!.width);
    expect(box!.y).toBeGreaterThanOrEqual(outer!.y);
    expect(box!.y).toBeLessThan(outer!.y + 60);
  }
});

// Cartridge names are 12px or larger from 768 to 1199 (no 10px labels).
test('cartridge face labels are at least 12px and fit their faces at 1024', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/keyframe/');
  const sizes = await page.locator('.face-name').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(12);
  const overflow = await page.locator('.face').evaluateAll((els) => els.filter((f) => f.scrollHeight > f.clientHeight + 1).length);
  expect(overflow).toBe(0);
});

// The authority route for C-04 is drawn as one orthogonal trace of six points ending at the ledger row.
test('selecting C-04 draws its authority route to the ledger row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/keyframe/');
  await page.locator('[data-part-id="C-04"]').filter({ visible: true }).first().click();
  await expect(page.locator('.ledger-row')).toHaveText(/C-04 Permissions → C-10 History/);
  const points = await page.locator('.overlay polyline.route').evaluateAll((els) => els.map((el) => el.getAttribute('points')!.trim().split(/\s+/).length));
  expect(points).toContain(6);
});

// Touch targets: primary buttons are at least 44px tall on a phone.
test('primary buttons are at least 44px tall at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const heights = await page.locator('.btn').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
});

test('phone widths keep a side gutter on the hero and every beat', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const offenders = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main h1, main h2, main p')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ text: el.textContent!.trim().slice(0, 40), left: el.getBoundingClientRect().left }))
      .filter((r) => r.left < 16),
  );
  expect(offenders).toEqual([]);
});
