import { test, expect } from "@playwright/test";

// The Bun.serve page (SSR'd React 19 + Astryx) is started by Playwright's
// `webServer` config option as a `bun run playwright-server.tsx` child
// process -- see playwright.config.ts and API_NOTES.md for why the server
// cannot run inside the Playwright test process itself.

test("SSR'd React 19 + Astryx button hydrates in a real browser and click changes text", async ({
  page,
}) => {
  await page.goto("/");
  const button = page.locator("#probe-button");
  await expect(button).toContainText("Click me");
  await button.click();
  await expect(button).toContainText("Clicked");
});
