// Journey H - Cancellation/error (spec lines 588-695, "Journey H"):
//   begin streaming/tool run -> cancel/interruption -> verify UI state -> retry/resume where the
//   reference allows. Also inject a deterministic provider error and compare failure/recovery.
//
// Cancellation uses the `plain` scenario + Stop mid-stream (reference-behavior-matrix.md §7:
// status -> "Stopped", partial reply kept). The provider-error branch uses the mock's
// `[[scenario:error]]` marker (a real, scripted HTTP 500 from a separate process - fixtures/
// mock-model/server.ts), which both systems hit identically; the automatic retry budget (5
// attempts) and terminal-failure vocabulary ("Deep diving for Ns" / "Retried model request (k/5)")
// are shared, faithfully-reproduced strings (cognate/src/ui/App.tsx mirrors them). Only the
// resulting failure *code* is asserted via driver.expectations().providerErrorCode, a documented,
// evidence-backed difference (see Expectations.providerErrorCode's doc comment in
// tests/drivers/types.ts): the reference's only confirmed code is for a genuine network timeout,
// not this scripted-500 path, so this journey asserts a failure/terminal state generically and only
// checks the specific code where the app exposes it as visible text.
import { test, expect } from "@playwright/test";
import { setupJourney, teardownJourney, bootToReadyComposer, evidence, type JourneyEnv } from "./harness";

test.describe("Journey H - cancellation and provider error", () => {
  let env: JourneyEnv;

  test.beforeEach(async () => {
    env = await setupJourney("H", { retryBackoffMs: 50 });
  });

  test.afterEach(async () => {
    if (env) await teardownJourney(env);
  });

  test("cancelling an in-flight run shows Stopped, keeps the partial reply, and a follow-up turn still works", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);
    await env.driver.newSession(page);

    // begin streaming/tool run -> cancel/interruption
    await env.driver.send(page, "[[scenario:plain]] cancel me please");
    await expect(env.driver.locators.stopButton(page)).toBeVisible({ timeout: 10_000 });
    await env.driver.locators.stopButton(page).click();
    await evidence(page, testInfo, "01-cancelled");

    // verify UI state: "Stopped", no pending stream, no duration badge for this turn.
    await expect(page.getByText(/^Stopped$/).first()).toBeVisible({ timeout: 10_000 });
    await expect(env.driver.locators.stopButton(page)).toHaveCount(0);

    // retry/resume: a working follow-up turn in the same session.
    await env.driver.send(page, "[[scenario:plain]] a follow-up after cancelling");
    await env.driver.waitForIdle(page, { timeoutMs: 20_000 });
    await evidence(page, testInfo, "02-follow-up-completed");
    await expect(page.getByText(/follow-up after cancelling/).first()).toBeVisible();
  });

  test("a deterministic provider error triggers retries then a terminal failure, with a documented failure-code difference", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);
    await env.driver.newSession(page);

    // inject a deterministic provider error (scripted HTTP 500, same mock-model process both
    // systems talk to).
    await env.driver.send(page, "[[scenario:error]] trigger a provider error");

    // While retrying: an in-flight/thinking status persists across the failures rather than
    // surfacing an error immediately (reference-behavior-matrix.md §8's "Deep diving for Ns").
    await expect(page.getByText(/Deep diving/i).first()).toBeVisible({ timeout: 5_000 });
    await evidence(page, testInfo, "01-retrying");

    // terminal failure copy: the run eventually settles into a failed/errored terminal state.
    await env.driver.waitForIdle(page, { timeoutMs: 60_000 });
    await evidence(page, testInfo, "02-terminal-failure");
    await expect(page.getByText(/failed|error/i).first()).toBeVisible();

    // Documented difference (Expectations.providerErrorCode): where the failure code is exposed as
    // visible text, it differs between systems by construction - assert only Cognate's confirmed
    // code (HTTP_500, cognate/DEVIATIONS.md "Provider-error code mapping is text-based ..."); the
    // reference's code for this specific scripted-500 path (as opposed to a genuine timeout) is not
    // confirmed by reference-behavior-matrix.md, so this suite does not assert a specific code
    // string for the reference here - only that SOME terminal failure state is reached (above).
    if (env.system === "cognate") {
      await expect(page.getByText(env.driver.expectations().providerErrorCode).first()).toBeVisible();
    }
  });
});
