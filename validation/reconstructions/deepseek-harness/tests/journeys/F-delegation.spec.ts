// Journey F - Delegation (spec lines 588-695, "Journey F"):
//   request task requiring delegation -> parent delegates -> delegated/subagent activity becomes
//   visible -> child work completes -> result returns to parent -> parent completes
//   "Match the pinned reference's actual presentation."
//
// Uses the mock model's `delegate` scenario (fixtures/mock-model/server.ts): the parent calls the
// `subagent` tool; a child session runs to completion (its own `[[scenario:child]]`-scripted turn);
// the child's result reaches the parent as a synthetic context message on the parent's *next* turn
// (fire-and-forget - reference-behavior-matrix.md §6.4, cognate/DEVIATIONS.md "Subagents (T10)").
// driver.openSubagentList(page) hides the reference's "N subagents" tree disclosure vs. Cognate's
// right-panel button of the same accessible name pattern.
import { test, expect } from "@playwright/test";
import { setupJourney, teardownJourney, bootToReadyComposer, waitUntil, evidence, type JourneyEnv } from "./harness";

test.describe("Journey F - delegation", () => {
  let env: JourneyEnv;

  test.beforeEach(async () => {
    env = await setupJourney("F");
  });

  test.afterEach(async () => {
    if (env) await teardownJourney(env);
  });

  test("delegating a task shows the subagent as active, then completed, with the parent completing too", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);
    await env.driver.newSession(page);

    // request task requiring delegation -> parent delegates -> delegated/subagent activity visible
    await env.driver.send(page, "[[scenario:delegate]] delegate this now");
    const sawSubagentBanner = await waitUntil(
      async () => (await page.getByRole("button", { name: /\d+ subagents?/i }).count()) > 0,
      15_000,
    );
    await evidence(page, testInfo, "01-subagent-active");
    expect(sawSubagentBanner, "expected an 'N subagent(s)' disclosure banner to appear").toBe(true);

    // child work completes -> result returns to parent -> parent completes
    await env.driver.waitForIdle(page, { timeoutMs: 20_000 });
    await evidence(page, testInfo, "02-parent-completed");

    // subagent visible then completed
    await env.driver.openSubagentList(page);
    await evidence(page, testInfo, "03-subagent-panel");
    await expect(env.driver.locators.subagentCard(page)).toBeVisible();
  });
});
