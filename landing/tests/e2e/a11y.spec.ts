import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

type Violation = { id: string; nodes: { html: string; target: string[] }[] };

function blocking(violations: Violation[]) {
  return violations.filter((v) => v.nodes.length > 0);
}

for (const width of [1440, 375]) {
  for (const path of ['/', '/keyframe/']) {
    test(`axe: zero serious or critical violations on ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).analyze();
      const bad = blocking(
        results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical') as unknown as Violation[],
      );
      expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
}

test('axe: exploded-view part buttons have names that match their text', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.id === 'label-content-name-mismatch').map((v) => v.nodes.length)).toEqual([]);
});
