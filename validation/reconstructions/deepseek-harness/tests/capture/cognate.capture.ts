/**
 * T5b Cognate capture pass for the DeepSeek Harness reconstruction test.
 *
 * Mirrors capture/reference.capture.ts's checkpoint names, viewports, and animation-disabling so
 * the two screenshot sets line up 1:1 for tests/visual/compare.ts. Drives the Cognate
 * reconstruction through CognateDriver (drivers/cognate.ts) instead of the pinned reference.
 * Differences from the reference pass, all deliberate (see APP/DEVIATIONS.md):
 *   - No first-run dialog sequence (single-operator local app) — 01/03 are the same shell state.
 *   - One-step "Settings -> Models" form (no provider-add wizard / no per-model tabpanel) — 02b/02c/02d
 *     map onto that single form's filled / saved / reopened-redacted states.
 *   - Theme toggle lives in the sidebar bottom (Dark/Light button), not Settings -> General.
 *   - "18-error" is forced by pointing the model config at a closed port, same technique the
 *     reference pass uses (its own [[scenario:error]] marker was unreachable there too).
 *
 * Usage:
 *   bun run tests/capture/cognate.capture.ts <viewport-name> <width> <height> <home-dir> <port> <ws-dir>
 *
 * Requires: mock-model server already running at http://127.0.0.1:4010.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { CognateDriver } from "../drivers/cognate";

const [, , viewportName, widthStr, heightStr, homeDir, portStr, wsDir] = process.argv;
const width = Number(widthStr);
const height = Number(heightStr);
const port = Number(portStr);

const ROOT = "/home/sprime01/projects/cognate/validation/reconstructions/deepseek-harness";
const SHOT_DIR = `${ROOT}/cognate/screenshots/${viewportName}`;
const ARIA_DIR = `${ROOT}/cognate/observations/aria`;
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

async function checkpoint(page: import("@playwright/test").Page, name: string, opts?: { fullPage?: boolean; aria?: boolean }) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: opts?.fullPage ?? true });
  if (opts?.aria !== false) {
    const snap = await page.locator("body").ariaSnapshot();
    await Bun.write(`${ARIA_DIR}/${name}.${viewportName}.txt`, snap);
  }
  console.log(`[capture] ${viewportName}/${name}`);
}

const driver = new CognateDriver();

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

try {
  // 01 - first launch: no first-run dialogs in this app (single-operator local build) — the
  // shell lands directly on the "no workspace" empty state.
  await driver.authenticate(page);
  await checkpoint(page, "01-first-launch");

  // 03 - no workspace: same state as 01 here (no intervening dialog) — captured separately to
  // keep the checkpoint name set aligned with the reference for tests/visual/compare.ts.
  await checkpoint(page, "03-no-workspace");

  // 02 - model settings: Settings modal, empty form.
  await driver.openSettingsModels(page);
  await checkpoint(page, "02-model-settings");

  // 02b - the (single-step) Custom Model API form, filled in but not yet saved.
  await page.getByLabel("Base URL").fill("http://127.0.0.1:4010/v1");
  await page.getByLabel("Model").fill("mock-model-1");
  await page.getByLabel("API key").fill("dummy-key-12345");
  await checkpoint(page, "02b-model-settings-custom-form");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(300);
  await checkpoint(page, "02c-model-settings-provider-created");

  // Redaction check: close and reopen Settings; the saved API key must never be shown back —
  // the field should carry only a placeholder hint (write-only credential contract).
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(200);
  await driver.openSettingsModels(page);
  await checkpoint(page, "02d-model-settings-redacted-key");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(200);

  // 04 - workspace selected: composer becomes enabled.
  await driver.chooseWorkspace(page, wsDir);
  await checkpoint(page, "04-workspace-selected");

  // 05 - empty session (explicit "New session").
  await driver.newSession(page);
  await checkpoint(page, "05-empty-session");

  // 06 - user message sent (composer emptied, user bubble visible, run in flight).
  await driver.send(page, "[[scenario:plain]] hello there");
  await page.waitForTimeout(150);
  await checkpoint(page, "06-user-message");

  // 07 - streaming: capture shortly after send, before the run necessarily settles.
  await page.waitForTimeout(300);
  await checkpoint(page, "07-streaming");

  // 15 - completed session (status dot, duration badge, full markdown rendering).
  await driver.waitForIdle(page, { timeoutMs: 30_000 });
  await page.waitForTimeout(300);
  await checkpoint(page, "15-completed-session");

  // 19 - cancelled: start another stream and click Stop mid-flight.
  await driver.newSession(page);
  await driver.send(page, "[[scenario:plain]] cancel me please");
  await page.waitForTimeout(60);
  const stopBtn = page.getByRole("button", { name: "Stop", exact: true });
  if ((await stopBtn.count()) > 0 && (await stopBtn.isVisible().catch(() => false))) {
    await stopBtn.click();
    await page.waitForTimeout(300);
    await checkpoint(page, "19-cancelled");
  } else {
    console.log("[capture] 19-cancelled: run settled before Stop could be clicked — capturing final state instead");
    await driver.waitForIdle(page, { timeoutMs: 10_000 });
    await checkpoint(page, "19-cancelled-no-stop-button-found");
  }

  // 18 - error: point the model config at a closed port to force a genuine network error.
  await driver.openSettingsModels(page);
  await page.getByLabel("Base URL").fill("http://127.0.0.1:4099/v1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(200);
  await driver.newSession(page);
  await driver.send(page, "trigger a real provider error");
  await page.waitForTimeout(3000);
  await driver.waitForIdle(page, { timeoutMs: 15_000 });
  await checkpoint(page, "18-error");

  // 16 - session history: sidebar with multiple sessions from this run.
  await checkpoint(page, "16-session-history");

  // 17 - restored after reload: reload the page and verify session list + last-open session
  // content survive.
  await driver.reload(page);
  await page.waitForTimeout(500);
  await checkpoint(page, "17-restored-after-reload");

  // 20 - theme variant: sidebar theme toggle -> Dark.
  await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
  await page.waitForTimeout(200);
  await checkpoint(page, "20-theme-variant");
} finally {
  await browser.close();
  await driver.stop();
}
