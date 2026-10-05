// Journey G - Persistence (spec lines 588-695, "Journey G"):
//   perform multi-step session -> terminate Web/runtime process -> restart -> reopen workspace
//   -> reopen session -> verify durable visible state
//
// Also covers the spec's own worked example of a "deliberate, evidence-backed difference": a
// pending approval survives a full process restart on Cognate but not on the reference
// (reference-behavior-matrix.md §6.2 "Full process restart"; cognate/DEVIATIONS.md "Pending
// approvals survive a full server restart; the reference does not (T8)"). The *assertion* below is
// identical for both systems - "does the visible state after restart match
// driver.expectations().approvalSurvivesRestart" - only the expected value differs, and it is
// documented on the Expectations type (tests/drivers/types.ts) and each driver's expectations().
import { test, expect } from "@playwright/test";
import { setupJourney, teardownJourney, bootToReadyComposer, evidence, type JourneyEnv } from "./harness";

test.describe("Journey G - persistence", () => {
  let env: JourneyEnv;

  test.beforeEach(async () => {
    env = await setupJourney("G");
  });

  test.afterEach(async () => {
    if (env) await teardownJourney(env);
  });

  test("a completed multi-step session survives a real process kill + restart", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);
    await env.driver.newSession(page);

    // perform multi-step session (tool execution turn, so there is real durable state to check:
    // transcript, tool artifact, and the workspace-mutation from Journey C's same scenario).
    await env.driver.send(page, "[[scenario:multi]] do the multi-step task now");
    await env.driver.waitForIdle(page, { timeoutMs: 30_000 });
    await evidence(page, testInfo, "01-before-restart");
    await expect(page.getByText(/Howdy/).first()).toBeVisible();

    // terminate Web/runtime process -> restart (same home dir - a real kill, not a soft reload).
    await env.driver.restart(page, env.launchOptions);

    // reopen workspace -> reopen session -> verify durable visible state. Both systems persist the
    // last-open workspace/session in their home dir, so a fresh authenticate() against the SAME
    // home dir after restart is expected to land directly back on it; only fall back to the manual
    // Settings -> choose-workspace -> open-session dance if that didn't happen.
    await env.driver.authenticate(page);
    const alreadyRestored = await page.getByText(/Howdy/).first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!alreadyRestored) {
      await env.driver.openSettingsModels(page);
      const closeSettings = page.getByRole("button", { name: /^Close(?: settings)?$/, exact: false });
      if ((await closeSettings.count()) > 0) await closeSettings.first().click().catch(() => {});
      await page.waitForTimeout(200);
      await env.driver.chooseWorkspace(page, env.workspaceDir);
      await env.driver.openSession(page, 0);
    }
    await evidence(page, testInfo, "02-after-restart");

    await expect(page.getByText(/Howdy/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("documented difference: pending-approval survival across a full process restart", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);
    await env.driver.newSession(page);
    await env.driver.prepareApprovalTrigger(page);
    await env.driver.send(page, "[[scenario:approval]] run something risky");
    await expect(env.driver.locators.approvalPanel(page)).toBeVisible({ timeout: 15_000 });
    await evidence(page, testInfo, "01-pending-before-restart");

    await env.driver.restart(page, env.launchOptions);
    await env.driver.authenticate(page);
    const alreadyRestored =
      (await env.driver.locators.composer(page).isVisible({ timeout: 5000 }).catch(() => false)) ||
      (await env.driver.locators.approvalPanel(page).isVisible({ timeout: 1000 }).catch(() => false));
    if (!alreadyRestored) {
      await env.driver.openSettingsModels(page);
      const closeSettings = page.getByRole("button", { name: /^Close(?: settings)?$/, exact: false });
      if ((await closeSettings.count()) > 0) await closeSettings.first().click().catch(() => {});
      await page.waitForTimeout(200);
      await env.driver.chooseWorkspace(page, env.workspaceDir);
      await env.driver.openSession(page, 0);
    }
    await evidence(page, testInfo, "02-after-restart");

    const survives = env.driver.expectations().approvalSurvivesRestart;
    if (survives) {
      await expect(env.driver.locators.approvalPanel(page)).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(env.driver.locators.approvalPanel(page)).toHaveCount(0);
    }
  });
});
