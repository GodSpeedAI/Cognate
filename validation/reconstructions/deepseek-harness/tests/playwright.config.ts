import { defineConfig, devices } from "@playwright/test";

/**
 * Shared Playwright config for the DeepSeek Harness reconstruction parity suite.
 *
 * This config backs both:
 *   - capture/reference.capture.ts   (T2: reference-only screenshot/aria capture)
 *   - a future parameterized journey suite (T3+) that runs the same journeys
 *     against the pinned reference AND the Cognate reconstruction via the
 *     Driver interface in drivers/types.ts.
 *
 * Fixed, deterministic environment: two named viewports (no device emulation
 * beyond viewport/DPR), UTC timezone, en-US locale, reduced motion, DPR=1.
 * Chromium is resolved from the host's Playwright cache
 * (~/.cache/ms-playwright/chromium-1243), matching @playwright/test 1.63.0's
 * expected chromium revision (1243) - see tests/node_modules -> repo root
 * node_modules/.bun/playwright-core@1.63.0.
 */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1024, height: 768 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    viewport: VIEWPORTS.desktop,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    colorScheme: "light",
  },
});
