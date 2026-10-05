// Journey E - Plan (spec lines 588-695, "Journey E"):
//   request multi-step task -> plan appears -> plan changes as work proceeds -> completed plan state
//   "Only assert the specific plan UI demonstrated by the reference."
//
// Uses the mock model's `plan` scenario (fixtures/mock-model/server.ts): `todo_write` (two todos,
// one in_progress/one pending) -> `exit_plan_mode`. reference-behavior-matrix.md §6.3: this
// produces a Plan review card (`region "Approve this plan and leave plan mode?"`), and on Approve a
// persistent "To-dos" region. Both drivers' `sendInPlanMode`/`approvePlan` hide the mechanical
// difference (reference: `/plan` autocomplete option click; Cognate: literal `/plan ` prefix).
import { test, expect } from "@playwright/test";
import { setupJourney, teardownJourney, bootToReadyComposer, evidence, type JourneyEnv } from "./harness";

test.describe("Journey E - plan", () => {
  let env: JourneyEnv;

  test.beforeEach(async () => {
    env = await setupJourney("E");
  });

  test.afterEach(async () => {
    if (env) await teardownJourney(env);
  });

  test("a plan-mode task shows a plan review card and, once approved, a persisted to-dos state", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);
    await env.driver.newSession(page);

    // request multi-step task -> plan appears (todo_write, then the exit_plan_mode review card).
    await env.driver.sendInPlanMode(page, "[[scenario:plan]] make a plan now");
    await expect(env.driver.locators.planPanel(page)).toBeVisible({ timeout: 15_000 });
    await evidence(page, testInfo, "01-plan-review");

    // plan changes as work proceeds -> completed plan state: Approve exits plan mode, the run
    // completes, and a To-dos widget persists (reference-behavior-matrix.md §6.3).
    await env.driver.approvePlan(page);
    await env.driver.waitForIdle(page, { timeoutMs: 15_000 });
    await expect(env.driver.locators.planPanel(page)).toHaveCount(0);
    await evidence(page, testInfo, "02-plan-completed");

    await expect(page.getByText(/To-dos/i).first()).toBeVisible();
  });
});
