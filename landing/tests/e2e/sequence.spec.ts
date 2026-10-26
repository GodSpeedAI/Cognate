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
  // Same pose both ways. Chromium's rasteriser can differ by 1/255 on a few anti-aliased edge pixels
  // between passes, so compare pixels with a tolerance instead of bytes: no channel may differ by more
  // than 8, and at most 0.05% of pixels may differ at all.
  for (const [i, u] of units.entries()) {
    const diff = await page.evaluate(async ([a, b]) => {
      const load = async (s: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${s}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
      };
      const A = await load(a);
      const B = await load(b);
      if (A.width !== B.width || A.height !== B.height) return { sizeMismatch: true, changed: 0, max: 0, total: 0 };
      let changed = 0;
      let max = 0;
      for (let k = 0; k < A.data.length; k += 4) {
        const d = Math.max(Math.abs(A.data[k] - B.data[k]), Math.abs(A.data[k + 1] - B.data[k + 1]), Math.abs(A.data[k + 2] - B.data[k + 2]));
        if (d > 0) changed++;
        if (d > max) max = d;
      }
      return { sizeMismatch: false, changed, max, total: A.data.length / 4 };
    }, [forward[i].toString('base64'), backward[i].toString('base64')] as const);
    expect(diff.sizeMismatch, `unit ${u} size`).toBe(false);
    expect(diff.max, `unit ${u} max channel diff`).toBeLessThanOrEqual(8);
    expect(diff.changed / diff.total, `unit ${u} changed pixel ratio`).toBeLessThanOrEqual(0.0005);
  }
});
