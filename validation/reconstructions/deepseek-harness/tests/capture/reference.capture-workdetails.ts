/**
 * One-off reference observation pass for the "Work details" P1 (reference-behavior-matrix.md §10:
 * Settings -> General -> "Work details" — "Choose how much detail to show for tool calls", default
 * "Standard"). Captures the `multi` scenario's tool/file cards under each of the four options
 * (Compact/Standard/Detailed/Verbose) at the desktop viewport, plus verifies persistence of both
 * Work details and Theme across a page reload.
 *
 * Usage:
 *   bun run tests/capture/reference.capture-workdetails.ts <home-dir> <port> <ws-dir>
 *
 * Requires: the mock model (aimock/llmock serving fixtures/aimock/fixtures.json) already
 * running at http://127.0.0.1:4010 — `just harness-up` boots exactly that..
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { ReferenceDriver } from "../drivers/reference";

const [, , homeDir, portStr, wsDir] = process.argv;
const port = Number(portStr);
const width = 1440;
const height = 900;
const viewportName = "desktop";

const ROOT = "/home/sprime01/projects/cognate/validation/reconstructions/deepseek-harness";
const SHOT_DIR = `${ROOT}/reference/screenshots/${viewportName}`;
const ARIA_DIR = `${ROOT}/reference/observations/aria`;
mkdirSync(SHOT_DIR, { recursive: true });
mkdirSync(ARIA_DIR, { recursive: true });

const DISABLE_ANIMATIONS_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}
`;

async function checkpoint(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
  const snap = await page.locator("body").ariaSnapshot();
  await Bun.write(`${ARIA_DIR}/${name}.${viewportName}.txt`, snap);
  console.log(`[capture] ${viewportName}/${name}`);
}

const driver = new ReferenceDriver(`${ROOT}/../../../.tmp/ref/deepseek-harness`);

await driver.launch({ homeDir, port, mockModelBaseUrl: "http://127.0.0.1:4010/v1" });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  locale: "en-US",
  timezoneId: "UTC",
  reducedMotion: "reduce",
  colorScheme: "light",
});
await ctx.addInitScript((css) => {
  window.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  });
}, DISABLE_ANIMATIONS_CSS);
const page = await ctx.newPage();

const MODES = ["Compact", "Standard", "Detailed", "Verbose"] as const;

/** Settings -> General -> "Work details": a dropdown selector button whose accessible name equals
 *  the currently-selected label (PreferenceRow.tsx), not a fixed name. "Performance & usage" (a
 *  sibling preference row) also defaults to the label "Detailed", so a bare
 *  `getByRole("button", { name: current })` is ambiguous once Work details reaches "Detailed" —
 *  scope to the row identified by its unique description text first. */
async function setWorkDetails(page: import("@playwright/test").Page, current: string, target: string): Promise<void> {
  const desc = page.getByText("Choose how much detail to show for tool calls", { exact: true });
  const row = desc.locator("xpath=ancestor::div[2]");
  await row.getByRole("button", { name: current, exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole("menuitem", { name: target, exact: true }).click();
  await page.waitForTimeout(200);
}

try {
  await driver.authenticate(page);
  await driver.openSettingsModels(page);
  await page.waitForTimeout(500);
  await driver.configureModel(page, { baseUrl: "http://127.0.0.1:4010/v1", apiKey: "dummy-key-12345", protocol: "openai-completions" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(300);
  await driver.chooseWorkspace(page, wsDir);
  await page.waitForTimeout(300);

  // Confirm the default label really is "Standard" before touching anything.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.waitForTimeout(200);
  const defaultVisible = await page.getByRole("button", { name: "Standard", exact: true }).isVisible().catch(() => false);
  console.log(`[observe] default Work details label visible ("Standard"): ${defaultVisible}`);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(200);

  let currentLabel = "Standard";
  for (const mode of MODES) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "General", exact: true }).click();
    await page.waitForTimeout(200);
    if (currentLabel !== mode) {
      await setWorkDetails(page, currentLabel, mode);
      currentLabel = mode;
    }
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.waitForTimeout(200);

    await driver.newSession(page);
    await driver.send(page, "[[scenario:multi]] do the multi-step task now");
    await page.waitForSelector(".tool-activity-btn, [class*='toolActivity']", { timeout: 5_000 }).catch(() => undefined);
    // Also wait for the run to fully settle so the completed tool/file cards are visible too.
    await driver.waitForIdle(page, { timeoutMs: 30_000 });
    await page.waitForTimeout(400);
    await checkpoint(page, `21-work-details-${mode.toLowerCase()}`);
  }

  // Persistence check 1: Work details across a reload. Currently "Verbose" (last mode set above).
  await driver.reload(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.waitForTimeout(200);
  const verboseSurvivedReload = await page.getByRole("button", { name: "Verbose", exact: true }).isVisible().catch(() => false);
  console.log(`[observe] Work details "Verbose" survives reload: ${verboseSurvivedReload}`);

  // Persistence check 2: Theme across a reload. Set Dark, reload, check it's still Dark.
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.waitForTimeout(300);
  const darkPressedBefore = await page.getByRole("button", { name: "Dark", exact: true }).getAttribute("aria-pressed");
  console.log(`[observe] Dark aria-pressed right after click: ${darkPressedBefore}`);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(200);
  await driver.reload(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.waitForTimeout(200);
  const darkPressedAfterReload = await page.getByRole("button", { name: "Dark", exact: true }).getAttribute("aria-pressed");
  console.log(`[observe] Dark aria-pressed after reload: ${darkPressedAfterReload}`);
  await checkpoint(page, "21b-persistence-after-reload");
} finally {
  await browser.close();
  await driver.stop();
}
