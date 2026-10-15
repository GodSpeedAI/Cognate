import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

// Sequence C is pinned on desktop. Unit u maps to scrollY = trackTop + (u/100) * (trackHeight - viewportHeight).
async function scrollToUnit(page: import('@playwright/test').Page, unit: number) {
  const y = await page.evaluate((u) => {
    const track = document.querySelector<HTMLElement>('[data-sequence="C"]')!;
    const top = track.getBoundingClientRect().top + window.scrollY;
    return top + (u / 100) * (track.offsetHeight - window.innerHeight);
  }, unit);
  await page.evaluate((target) => window.scrollTo(0, target), y);
  await page.waitForTimeout(350);
}

test('Sequence C: captions change at the specified units, forward and back', async ({ page }) => {
  await page.goto('/#parts');
  await scrollToUnit(page, 0);
  await expect(page.locator('.seq-caption')).toHaveText('This is the real app.');
  await scrollToUnit(page, 30);
  await expect(page.locator('.seq-caption')).toHaveText('Four layers: interface, agents, capabilities, durable record.');
  await scrollToUnit(page, 90);
  await expect(page.locator('.seq-caption')).toHaveText('Parts connect by contract. Select one.');
  await scrollToUnit(page, 0);
  await expect(page.locator('.seq-caption')).toHaveText('This is the real app.');
});

test('Sequence C: stills at units 0/24/48/68/84 match in both directions', async ({ page }) => {
  await page.goto('/#parts');
  const units = [0, 24, 48, 68, 84];
  const forward: Buffer[] = [];
  for (const u of units) {
    await scrollToUnit(page, u);
    forward.push(await page.locator('[data-sequence="C"] .seq-stage').screenshot());
  }
  const backward: Buffer[] = [];
  for (const u of [...units].reverse()) {
    await scrollToUnit(page, u);
    backward.unshift(await page.locator('[data-sequence="C"] .seq-stage').screenshot());
  }
  units.forEach((u, i) => expect(forward[i].equals(backward[i]), `unit ${u}`).toBe(true));
});
