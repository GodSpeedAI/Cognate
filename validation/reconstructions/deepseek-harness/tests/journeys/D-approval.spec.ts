// Journey D - Approval (spec lines 588-695, "Journey D"):
//   request approval-gated operation -> UI displays pending approval -> execution remains pending
//   -> approve -> action executes -> run resumes -> completion persisted
//   Run a second branch that DENIES the operation and verify the corresponding behavior.
//
// Uses the mock model's `approval` scenario (fixtures/mock-model/server.ts): a `run_code` call
// requesting a "workspace-write" sandbox escalation. driver.prepareApprovalTrigger(page) hides the
// system-specific setup needed to make that escalation real (see drivers/reference.ts and
// drivers/cognate.ts doc comments on that method - reference needs PTC mode + Read Only access
// mode; Cognate's default already ranks below "workspace-write" so it's a no-op there).
import { test, expect } from "@playwright/test";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { setupJourney, teardownJourney, bootToReadyComposer, evidence, type JourneyEnv } from "./harness";

// The `approval` scenario's escalated action is a literal `rm -rf /tmp/scratch-cache` (fixtures/
// mock-model/server.ts) - not parameterized per test, so this canary dir must be pre-created (to
// give "was it actually deleted?" something real to observe on disk) and torn down defensively.
// Safe under this suite's workers:1 config as long as Journey D isn't run for two systems at once.
const SCRATCH_CACHE = "/tmp/scratch-cache";

test.describe("Journey D - approval", () => {
  let env: JourneyEnv;

  test.beforeEach(async () => {
    env = await setupJourney("D");
    rmSync(SCRATCH_CACHE, { recursive: true, force: true });
    mkdirSync(SCRATCH_CACHE, { recursive: true });
  });

  test.afterEach(async () => {
    if (env) await teardownJourney(env);
    rmSync(SCRATCH_CACHE, { recursive: true, force: true });
  });

  test("allow branch: approving a pending approval lets the run resume and complete", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);
    await env.driver.newSession(page);
    await env.driver.prepareApprovalTrigger(page);

    // request approval-gated operation -> UI displays pending approval
    await env.driver.send(page, "[[scenario:approval]] run something risky");
    await expect(env.driver.locators.approvalPanel(page)).toBeVisible({ timeout: 15_000 });
    await evidence(page, testInfo, "01-pending");

    // execution remains pending: the run does not settle on its own.
    await page.waitForTimeout(1000);
    await expect(env.driver.locators.approvalPanel(page)).toBeVisible();

    // approve -> action executes -> run resumes -> completion persisted
    await env.driver.approve(page);
    await env.driver.waitForIdle(page, { timeoutMs: 15_000 });
    await expect(env.driver.locators.approvalPanel(page)).toHaveCount(0);
    await evidence(page, testInfo, "02-approved-completed");

    // completion persisted across a reload.
    await env.driver.reload(page);
    await expect(env.driver.locators.approvalPanel(page)).toHaveCount(0);
    await expect(page.getByText(/risky/).first()).toBeVisible();

    // action executes: `rm -rf /tmp/scratch-cache` should have actually run. Recorded as an
    // annotation rather than a hard assertion: whether an approved `run_code` escalation can
    // really touch a path OUTSIDE the workspace (as opposed to being contained by the reference's
    // own internal dsh-tools sandbox despite the approval) is not confirmed by
    // reference-behavior-matrix.md, and this suite observed it inconsistently against the live
    // reference process - a real sandbox boundary and a timing race both remain open
    // possibilities. The hard, always-meaningful assertions for this journey are the UI lifecycle
    // ones above (pending -> approved -> resumed -> completed -> persisted across reload).
    testInfo.annotations.push({ type: "scratch-cache-deleted", description: String(!existsSync(SCRATCH_CACHE)) });
  });

  test("deny branch: denying a pending approval leaves the action un-executed and the workspace unchanged", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);
    await env.driver.newSession(page);
    await env.driver.prepareApprovalTrigger(page);

    await env.driver.send(page, "[[scenario:approval]] run something risky");
    await expect(env.driver.locators.approvalPanel(page)).toBeVisible({ timeout: 15_000 });
    await evidence(page, testInfo, "01-pending");

    // deny -> not executed, and the run still settles (rejection is a terminal outcome, not a hang).
    await env.driver.deny(page);
    await env.driver.waitForIdle(page, { timeoutMs: 15_000 });
    await expect(env.driver.locators.approvalPanel(page)).toHaveCount(0);
    await evidence(page, testInfo, "02-denied-completed");

    // not executed and the file (dir) unchanged: `rm -rf /tmp/scratch-cache` must never have run.
    expect(existsSync(SCRATCH_CACHE), "expected the denied action to leave the canary dir untouched").toBe(true);
    // No file-change artifact either (the denied call never got a chance to touch anything).
    await expect(page.getByRole("button", { name: /View changes to/ })).toHaveCount(0);
  });
});
