/**
 * T2 reference capture pass for the DeepSeek Harness reconstruction test.
 *
 * Drives the pinned reference (`dsh web`) through the ReferenceDriver and
 * captures named screenshots + accessibility snapshots for every P0/P1
 * checkpoint that is actually reachable given the current fixtures (see
 * reference-behavior-matrix.md "Uncertainties resolved / Still unresolved"
 * for why several checkpoints from the spec's list are not captured here).
 *
 * Usage:
 *   bun run tests/capture/reference.capture.ts <viewport-name> <width> <height> <home-dir> <port> <ws-dir>
 *
 * Requires: mock-model server already running at http://127.0.0.1:4010
 * (started separately with a larger MOCK_CHUNK_DELAY_MS for this capture
 * pass, so the plain-scenario stream is slow enough to catch mid-stream and
 * to cancel — see reference-behavior-matrix.md).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { ReferenceDriver } from "../drivers/reference";

const [, , viewportName, widthStr, heightStr, homeDir, portStr, wsDir] = process.argv;
const width = Number(widthStr);
const height = Number(heightStr);
const port = Number(portStr);

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

async function checkpoint(page: import("@playwright/test").Page, name: string, opts?: { fullPage?: boolean; aria?: boolean }) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: opts?.fullPage ?? true });
  if (opts?.aria !== false) {
    const snap = await page.locator("body").ariaSnapshot();
    await Bun.write(`${ARIA_DIR}/${name}.${viewportName}.txt`, snap);
  }
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

try {
  // 01 - first launch: token handoff lands on shell with "Internal Testing
  // Notice" dialog and, until a workspace exists, the
  // "Unable to create default workspace" alert banner.
  await driver.authenticateRaw(page); // navigates + waits, does NOT dismiss dialogs
  await checkpoint(page, "01-first-launch");

  await driver.dismiss(page, "Continue");

  // 03 - no workspace: composer disabled, "Choose workspace" prompt visible.
  await checkpoint(page, "03-no-workspace");

  // 02 - model settings: Settings -> Models, then open the Custom Model API
  // form (the P0 uncertainty #9 from product-characterization.md - CONFIRMED
  // to exist: Provider ID / Display name / Base URL / API protocol / API key
  // / Models list, "Create provider" disabled until every field plus >=1
  // model id is filled in).
  await driver.openSettingsModels(page);
  await checkpoint(page, "02-model-settings");
  await driver.configureModel(
    page,
    { baseUrl: "http://127.0.0.1:4010/v1", apiKey: "dummy-key-12345", protocol: "openai-completions" },
    async (p) => checkpoint(p, "02b-model-settings-custom-form"),
  );
  await checkpoint(page, "02c-model-settings-provider-created");

  // Redaction check: reopen Edit on the created provider; the API key field
  // must show a "Configured - enter a new value to replace" placeholder,
  // never the plaintext value (write-only credential contract).
  await page.getByRole("button", { name: /Edit Mock Model/ }).click();
  await page.waitForTimeout(300);
  await checkpoint(page, "02d-model-settings-redacted-key");
  await driver.dismiss(page, "Cancel");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(300);

  // 04 - workspace selected: composer becomes enabled, a default session is
  // auto-created and selected in the sidebar.
  await driver.chooseWorkspace(page, wsDir);
  await checkpoint(page, "04-workspace-selected");

  // 05 - empty session (explicit "New session"; same composer-enabled shape).
  await driver.newSession(page);
  await checkpoint(page, "05-empty-session");

  // 06 - user message sent (composer emptied, user bubble visible, run in
  // flight).
  await driver.send(page, "[[scenario:plain]] hello there");
  await page.waitForTimeout(150);
  await checkpoint(page, "06-user-message");

  // 07 - streaming: with MOCK_CHUNK_DELAY_MS=250 on the mock server, the
  // ~35-word plain reply streams over several seconds - capture mid-stream.
  await page.waitForTimeout(1500);
  await checkpoint(page, "07-streaming");

  // 15 - completed session (status "Worked", duration badge, full markdown
  // rendering: heading, list, fenced code block with Wrap-lines/Copy).
  await driver.waitForIdle(page, { timeoutMs: 30_000 });
  await page.waitForTimeout(500);
  await checkpoint(page, "15-completed-session");

  // 19 - cancelled: start another slow stream and click Stop mid-flight.
  await driver.newSession(page);
  await driver.send(page, "[[scenario:plain]] cancel me please");
  await page.waitForTimeout(600);
  const stopBtn = page.getByRole("button", { name: /^Stop/i });
  if ((await stopBtn.count()) > 0) {
    await stopBtn.first().click();
    await page.waitForTimeout(500);
    await checkpoint(page, "19-cancelled");
  } else {
    console.log("[capture] 19-cancelled: no Stop-labelled button found while streaming - see matrix for the exact control found instead");
    await checkpoint(page, "19-cancelled-no-stop-button-found");
  }

  // 18 - error: point a second provider at a closed port to force a genuine
  // network/provider error end-to-end (independent of the mock server's
  // `[[scenario:error]]` marker, which is unreachable - see matrix).
  await driver.openSettingsModels(page);
  if ((await page.getByRole("button", { name: /Edit Broken Model/ }).count()) === 0) {
    await page.getByRole("button", { name: "Add model provider", exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole("tab", { name: "Custom model API", exact: true }).click();
    await page.waitForTimeout(200);
    const panel = page.getByRole("tabpanel", { name: "Custom model API" });
    await panel.getByRole("textbox", { name: "Provider ID" }).fill("broken-model");
    await panel.getByRole("textbox", { name: "Display name" }).fill("Broken Model");
    await panel.getByRole("textbox", { name: "Base URL" }).fill("http://127.0.0.1:4099/v1");
    await panel.getByRole("textbox", { name: "API key" }).fill("dummy-key");
    await panel.getByRole("button", { name: "Add model", exact: true }).click();
    await page.waitForTimeout(150);
    await panel.getByRole("textbox", { name: "Model ID 1" }).fill("broken-model-1");
    await panel.getByRole("textbox", { name: "Display name 1" }).fill("Broken Model 1");
    await panel.getByRole("button", { name: "Create provider", exact: true }).click();
    await page.waitForTimeout(500);
  }
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(300);
  await driver.newSession(page);
  const modelBtn = page.getByRole("button", { name: /Select model/ });
  await modelBtn.click();
  await page.waitForTimeout(150);
  await page.getByRole("menuitem", { name: /^Model/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole("menuitemradio", { name: "Broken Model 1" }).click();
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");
  await driver.send(page, "trigger a real provider error");
  await page.waitForTimeout(15000);
  await checkpoint(page, "18-error");

  // 16 - session history: sidebar with multiple sessions from this run.
  await checkpoint(page, "16-session-history");

  // 17 - restored after reload: reload the page and verify session list +
  // last-open session content survive.
  await driver.reload(page);
  await page.waitForTimeout(800);
  await checkpoint(page, "17-restored-after-reload");

  // 20 - theme variant: Settings -> General -> Appearance -> Dark.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(300);
  await checkpoint(page, "20-theme-variant");
} finally {
  await browser.close();
  await driver.stop();
}
