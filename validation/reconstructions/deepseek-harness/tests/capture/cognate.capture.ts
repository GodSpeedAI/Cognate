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
import { makeWorkspace } from "../../fixtures/workspace/make-workspace.ts";

const [, , viewportName, widthStr, heightStr, homeDir, portStr, wsDir] = process.argv;
const width = Number(widthStr);
const height = Number(heightStr);
const port = Number(portStr);

const ROOT = "/home/sprime01/projects/cognate/validation/reconstructions/deepseek-harness";
const SHOT_DIR = `${ROOT}/cognate/screenshots/${viewportName}`;
const ARIA_DIR = `${ROOT}/cognate/observations/aria`;
mkdirSync(SHOT_DIR, { recursive: true });
mkdirSync(ARIA_DIR, { recursive: true });
// The workspace dir (`wsDir`, driver.chooseWorkspace's target) must exist — and, for the
// `[[scenario:multi]]`/`[[scenario:edit]]` tool-execution checkpoints (08-10) to have anything to
// read/edit, must contain the same `fixtures/workspace/template` fixture (`src/greet.ts`) the
// `test/J-C-tool-execution.test.ts` journey test seeds via `makeWorkspace` — create/seed it here so
// callers don't have to remember to do this before running the capture.
if (wsDir) await makeWorkspace(wsDir);

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
  // 01 - first launch: Cognate-branded "Internal Testing Notice" + "Add an API key to get
  // started" dialog pair on a fresh COGNATE_HARNESS_HOME (critic round-1 P0-1) — captured with
  // both dialogs still up, mirroring reference.capture.ts's authenticateRaw()+checkpoint pattern.
  await driver.authenticateRaw(page);
  await checkpoint(page, "01-first-launch");

  await driver.dismiss(page, "Continue");

  // 03 - no workspace: reference/observations/aria/03-no-workspace.desktop.txt confirms the
  // reference still has its own second onboarding dialog ("Internal Testing Notice"'s follow-up)
  // open on top of the no-workspace shell at this checkpoint — only the *first* dialog has been
  // dismissed. Mirror that sequencing (critic round-2 capture-script fault: dismissing both dialogs
  // before this screenshot showed the fully-unblocked shell instead of the still-gated one).
  await checkpoint(page, "03-no-workspace");
  await driver.dismiss(page, "Configure later");

  // 02 - model settings: Settings modal, provider list (empty — no provider configured yet).
  await driver.openSettingsModels(page);
  await checkpoint(page, "02-model-settings");

  // 02b - the "Add model provider" wizard's Custom model API tab, just opened (empty form).
  await driver.configureModel(
    page,
    { baseUrl: "http://127.0.0.1:4010/v1", apiKey: "dummy-key-12345", protocol: "openai-completions" },
    async (p) => checkpoint(p, "02b-model-settings-custom-form"),
  );
  await checkpoint(page, "02c-model-settings-provider-created");

  // Redaction check: reopen Edit on the created provider; the API key field must show only a
  // "Configured - enter a new value to replace" placeholder, never the plaintext value
  // (write-only credential contract).
  await page.getByRole("button", { name: /^Edit mock-model/ }).click();
  await page.waitForTimeout(200);
  await checkpoint(page, "02d-model-settings-redacted-key");
  await driver.dismiss(page, "Cancel");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
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

  // --- T7-T8: tool execution + approval (journeys J-C-tool-execution, J-D-approval) ---

  // 08 - tool running: `[[scenario:multi]]` drives read -> bash -> edit; capture while the tool
  // activity indicator is showing (before the run settles).
  await driver.newSession(page);
  await driver.send(page, "[[scenario:multi]] do the multi-step task now");
  // Wait for the first tool-call event to actually reach the client (the mock model's first
  // scripted step + a network round trip) rather than a fixed short delay, so this doesn't race the
  // "current tool" indicator into capturing before it renders.
  await page.waitForSelector(".tool-activity-btn", { timeout: 5_000 }).catch(() => undefined);
  await checkpoint(page, "08-tool-running");

  // 09 - tool complete: run settled, final answer + edit summary button visible (collapsed).
  await driver.waitForIdle(page, { timeoutMs: 30_000 });
  await page.waitForTimeout(200);
  await checkpoint(page, "09-tool-complete");

  // 10 - file change collapsed/expanded: the edit summary's diff view toggle.
  await checkpoint(page, "10-file-change-collapsed");
  const diffToggle = page.getByRole("button", { name: /^View changes to/ }).first();
  if ((await diffToggle.count()) > 0) {
    await diffToggle.click();
    await page.waitForTimeout(150);
    await checkpoint(page, "10-file-change-expanded");
  } else {
    console.log("[capture] 10-file-change-expanded: no edit summary button found — skipping");
  }

  // 11 - approval pending: `[[scenario:approval]]` requests a `run_code` escalation; the tool
  // loop's default access mode (read-only) ranks below the requested "workspace-write", so
  // `approvalGate` opens a `tool-approval` continuation and the run waits.
  await driver.newSession(page);
  await driver.send(page, "[[scenario:approval]] run something risky");
  await page.waitForSelector('[data-approval-panel]', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(150);
  await checkpoint(page, "11-approval-pending");

  // 11b - approval pending after reload: the continuation is durable, so reopening the same
  // session (auto-restored via `cognate.lastSession.<workspaceId>`) shows the same pending card.
  await driver.reload(page);
  await page.waitForSelector('[data-approval-panel]', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(200);
  await checkpoint(page, "11b-approval-pending-after-reload");

  // 12 - approval resolved (allow): the tool call proceeds and the run completes.
  await driver.approve(page);
  await driver.waitForIdle(page, { timeoutMs: 15_000 });
  await page.waitForTimeout(200);
  await checkpoint(page, "12-approval-resolved-allow");

  // 12 - approval resolved (deny): a second `[[scenario:approval]]` run, rejected this time.
  await driver.newSession(page);
  await driver.send(page, "[[scenario:approval]] run something risky");
  await page.waitForSelector('[data-approval-panel]', { timeout: 15_000 }).catch(() => undefined);
  await driver.deny(page);
  await driver.waitForIdle(page, { timeoutMs: 15_000 });
  await page.waitForTimeout(200);
  await checkpoint(page, "12-approval-resolved-deny");

  // --- T9: plan mode (journey J-E-plan) ---

  // 13 - plan active: "/plan " prefix enters plan mode; `[[scenario:plan]]` drives
  // todo_write -> exit_plan_mode. Capture while the tool activity indicator is still showing
  // (before the review card renders), matching the reference's `13-plan-active`.
  await driver.newSession(page);
  await driver.send(page, "/plan make a plan now [[scenario:plan]]");
  // The `todo_write` activity window is brief (the mock model's next step, `exit_plan_mode`,
  // follows immediately) — target its exact label rather than any tool-activity-btn, which would
  // just as happily match the later `exit_plan_mode` state.
  await page.getByRole("button", { name: /Updating the plan/ }).waitFor({ timeout: 5_000 }).catch(() => undefined);
  await checkpoint(page, "13-plan-active");

  // 13b - plan review prompt: the `exit_plan_mode` call opens a `plan-review` continuation.
  await page.waitForSelector("[data-plan-panel]", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(150);
  await checkpoint(page, "13b-plan-review-prompt");

  // 13c - plan completed: Approve exits plan mode, the run completes, and the To-dos widget
  // persists.
  await driver.approvePlan(page);
  await driver.waitForIdle(page, { timeoutMs: 15_000 });
  await page.waitForTimeout(200);
  await checkpoint(page, "13c-plan-completed");

  // --- T10: subagents/delegation (journey J-F-delegation) ---

  // 14 - subagent active: `[[scenario:delegate]]` calls the `subagent` tool; capture while the
  // "Coordinating subagents · ..." activity indicator is showing.
  await driver.newSession(page);
  await driver.send(page, "[[scenario:delegate]] delegate this now");
  await page.getByRole("button", { name: /Coordinating subagents/ }).waitFor({ timeout: 5_000 }).catch(() => undefined);
  await checkpoint(page, "14-subagent-active");

  // 14b - subagent completed panel: the parent turn completes and the banner's "N subagent(s)"
  // disclosure opens the "Subagent sessions" tree.
  await driver.waitForIdle(page, { timeoutMs: 15_000 });
  await page.waitForTimeout(150);
  await driver.openSubagentPanel(page);
  await page.waitForTimeout(150);
  await checkpoint(page, "14b-subagent-completed-panel");

  // The delegated child (J-F-delegation) is fire-and-forget: the parent turn completes immediately
  // with "started subagent ..." while the child keeps streaming in the background. Root-caused via
  // app.sqlite's `events` table: this app's runtime processes runs off a single execution lane, so a
  // still-streaming background child can starve a *later* run's body from executing at all for a long
  // time — a run.cancelled with no matching session.turn.started ever committed for it was observed
  // downstream at 19-cancelled when this child was left running. Drain it here (poll the popover's own
  // row text for "· completed ·") so no heavy background work carries into the timing-sensitive
  // checkpoints that follow.
  await page
    .waitForFunction(() => document.querySelector(".subagent-row-text")?.textContent?.includes("completed"), { timeout: 60_000 })
    .catch(() => undefined);
  await page.waitForTimeout(150);

  // 15 - completed session (status dot, duration badge, full markdown rendering). Reference's
  // 15-completed-session is the earlier `[[scenario:plain]] hello there` session, not whatever
  // session was active most recently — reselect it explicitly before screenshotting (critic
  // round-2 capture-script fault: without this the checkpoint landed on the `delegate` session
  // instead, from the still-open subagent panel above).
  // Session rows truncate their accessible name to the rendered (ellipsized) text, so match the
  // full untruncated `title` attribute instead of the accessible name.
  await page.locator('button.session-row[title*="hello there"]').click();
  await page.waitForTimeout(150);
  await driver.waitForIdle(page, { timeoutMs: 30_000 });
  await page.waitForTimeout(300);
  await checkpoint(page, "15-completed-session");

  // 19 - cancelled: start another stream and click Stop mid-flight. Root-caused (not just a capture
  // artifact, though the fix lives in the capture script): the Composer's Stop button appears the
  // instant `client.startRun()`'s promise resolves (App.tsx sets `activeRunId` optimistically), but
  // `agent.coding`'s `run()` — and its very first line, `ctx.emit("session.turn.started", ...)` —
  // only actually executes on the runtime's own tick loop (packages/runtime-bun/src/runtime.ts,
  // `tickMs=10`). Clicking Stop the instant the button renders can therefore race ahead of that
  // first tick and cancel the run before `session.turn.started` is ever durably committed —
  // confirmed by querying app.sqlite's `events` table after a run using the original 60ms-wait
  // script: a `run.cancelled` row with no matching `session.turn.started` for the same
  // `session:<id>` correlation. This is the same race the reference's own capture script avoids by
  // waiting ~600ms after Send before looking for Stop (tests/capture/reference.capture.ts) rather
  // than clicking the instant the control appears — mirror that here.
  await driver.newSession(page);
  await driver.send(page, "[[scenario:plain]] cancel me please");
  await page.waitForTimeout(600);
  const stopBtn = page.getByRole("button", { name: "Stop generating", exact: true });
  await stopBtn.waitFor({ timeout: 10_000 }).catch(() => undefined);
  if ((await stopBtn.count()) > 0 && (await stopBtn.isVisible().catch(() => false))) {
    await stopBtn.click();
    // Wait for the actual "Stopped" render (title update, sidebar listing, and status chip are all
    // downstream of the `run.cancelled` event round-tripping back to the client) rather than a fixed
    // sleep — mirrors tests/journeys/H-cancellation.spec.ts's own
    // `expect(page.getByText(/^Stopped$/).first()).toBeVisible(...)` wait (critic round-2 capture-
    // script fault: a 300ms fixed wait raced past this and captured a stale frame).
    await page.getByText(/^Stopped$/).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    // The session's title/sidebar-listing come from the `sessions` projection, which is applied
    // asynchronously off the event log (see packages/runtime-bun/src/runtime.ts's `idle()`/`kick()` —
    // there is no synchronous guarantee it has caught up the instant `run.cancelled` is observable
    // client-side). Poll for the breadcrumb to move off "New Session" instead of a fixed sleep.
    await page
      .waitForFunction(() => !document.querySelector(".breadcrumb")?.textContent?.includes("New Session"), { timeout: 5_000 })
      .catch(() => undefined);
    await page.waitForTimeout(150);
    await checkpoint(page, "19-cancelled");
  } else {
    console.log("[capture] 19-cancelled: run settled before Stop could be clicked — capturing final state instead");
    await driver.waitForIdle(page, { timeoutMs: 10_000 });
    await checkpoint(page, "19-cancelled-no-stop-button-found");
  }

  // 18 - error: the mock model's `[[scenario:error]]` marker (deterministic HTTP 500) — T11's
  // retry budget (5 attempts) then the terminal failure block. The reference's own `18-error` used a
  // genuine network timeout against a closed port; this mock has no timeout scenario, so this
  // captures our honest HTTP_500 mapping instead of inventing a fake "Request timed out." — see
  // DEVIATIONS.md ("provider-error code mapping").
  await driver.newSession(page);
  await driver.send(page, "[[scenario:error]] trigger a provider error");
  await page.waitForTimeout(3000);
  await driver.waitForIdle(page, { timeoutMs: 60_000 });
  await checkpoint(page, "18-error");

  // 16 - session history: sidebar with multiple sessions from this run.
  await checkpoint(page, "16-session-history");

  // 17 - restored after reload: reload the page and verify session list + last-open session
  // content survive.
  await driver.reload(page);
  await page.waitForTimeout(500);
  await checkpoint(page, "17-restored-after-reload");

  // 20 - theme variant: Settings -> General -> Appearance -> Dark (matches
  // tests/capture/reference.capture.ts's own "Settings -> General -> Appearance -> Dark" step —
  // the theme switch lives in Settings now, not a persistent sidebar control; critic round-2 batch A
  // cross-cutting P2).
  await driver.openSettingsGeneral(page);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.waitForTimeout(200);
  await checkpoint(page, "20-theme-variant");
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await page.waitForTimeout(150);
} finally {
  await browser.close();
  await driver.stop();
}
