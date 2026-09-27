/**
 * T2 reference capture, part 2: tool execution, approval, plan, and
 * delegation checkpoints (08-tool-running .. 14-subagent-active), gated
 * behind the mock fixture's scenario-routing fix (commit d83960f).
 *
 * Key recipe findings (see reference-behavior-matrix.md §0/§6 for the full
 * writeup) needed to reach each state - none require editing the fixture:
 *   - `run_code` (what the `approval` scenario's tool call uses) is only a
 *     registered tool under the **PTC mode** agent preset; under the default
 *     Standard mode it errors "unknown tool \"run_code\"".
 *   - A sandbox-escalation `ask` only fires when the requested
 *     `sandbox_permissions` is STRICTLY WIDER than the session's current
 *     access mode. The fixture's `approval` scenario requests
 *     `"workspace-write"`; the default access mode is already
 *     "Workspace Write" (not wider), so it silently no-ops. Switching the
 *     session's access mode to **"Read Only"** first makes "workspace-write"
 *     a real escalation, and the approval card appears.
 *   - Plan mode is entered by typing the `/plan` slash command (which
 *     inserts a literal "/plan " prefix, not just a placeholder) and
 *     appending the task after it - replacing the composer text loses the
 *     prefix and `exit_plan_mode` then errors "only available in plan mode".
 *
 * Usage:
 *   bun run tests/capture/reference.capture-tools.ts <viewport-name> <width> <height> <home-dir> <port> <ws-dir>
 *
 * Requires: mock-model server already running at http://127.0.0.1:4010.
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
  viewport: { width, height }, deviceScaleFactor: 1, locale: "en-US",
  timezoneId: "UTC", reducedMotion: "reduce", colorScheme: "light",
});
const page = await ctx.newPage();

try {
  await driver.authenticate(page);
  await driver.openSettingsModels(page);
  await driver.configureModel(page, { baseUrl: "http://127.0.0.1:4010/v1", apiKey: "dummy-key-12345", protocol: "openai-completions" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(300);
  await driver.chooseWorkspace(page, wsDir);

  // --- 08/09/10: multi (read -> bash -> edit -> summary), Standard mode ---
  await driver.newSession(page);
  await driver.send(page, "[[scenario:multi]] do the multi-step task");
  await page.waitForTimeout(400);
  await checkpoint(page, "08-tool-running");
  await page.waitForTimeout(4000);
  await checkpoint(page, "09-tool-complete");
  await page.getByRole("button", { name: /View changes to/ }).click();
  await page.waitForTimeout(1500);
  await checkpoint(page, "10-file-change-expanded");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(300);
  await checkpoint(page, "10-file-change-collapsed");

  // --- 11/12: approval (PTC mode + Read Only access mode escalation) ---
  await driver.newSession(page);
  await driver.switchAgentPreset(page, "PTC mode");
  await page.getByRole("button", { name: /Access mode/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole("menuitem", { name: "Read Only", exact: true }).click();
  await page.waitForTimeout(200);
  await driver.send(page, "[[scenario:approval]] run something risky");
  await page.waitForTimeout(2000);
  await checkpoint(page, "11-approval-pending");
  await driver.approve(page);
  await page.waitForTimeout(1500);
  await checkpoint(page, "12-approval-resolved-allow");

  // Deny variant, fresh session.
  await driver.newSession(page);
  await driver.switchAgentPreset(page, "PTC mode");
  await page.getByRole("button", { name: /Access mode/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole("menuitem", { name: "Read Only", exact: true }).click();
  await page.waitForTimeout(200);
  await driver.send(page, "[[scenario:approval]] run something risky");
  await page.waitForTimeout(2000);
  await driver.deny(page);
  await page.waitForTimeout(1500);
  await checkpoint(page, "12-approval-resolved-deny");

  // Pending-approval reload persistence.
  await driver.newSession(page);
  await driver.switchAgentPreset(page, "PTC mode");
  await page.getByRole("button", { name: /Access mode/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole("menuitem", { name: "Read Only", exact: true }).click();
  await page.waitForTimeout(200);
  await driver.send(page, "[[scenario:approval]] run something risky");
  await page.waitForTimeout(2000);
  await driver.reload(page);
  await page.waitForTimeout(1000);
  await checkpoint(page, "11b-approval-pending-after-reload");

  // --- 13: plan mode ---
  await driver.newSession(page);
  await driver.sendInPlanMode(page, "[[scenario:plan]] make a plan");
  await page.waitForTimeout(800);
  await checkpoint(page, "13-plan-active");
  await page.waitForTimeout(2000);
  await checkpoint(page, "13b-plan-review-prompt");
  await driver.approvePlan(page);
  await page.waitForTimeout(1500);
  await checkpoint(page, "13c-plan-completed");

  // --- 14: delegate/subagent ---
  await driver.newSession(page);
  await driver.send(page, "[[scenario:delegate]] delegate this");
  await page.waitForTimeout(500);
  await checkpoint(page, "14-subagent-active");
  await page.waitForTimeout(4000);
  await driver.openSubagentList(page);
  await page.waitForTimeout(500);
  await checkpoint(page, "14b-subagent-completed-panel");
} finally {
  await browser.close();
  await driver.stop();
}
