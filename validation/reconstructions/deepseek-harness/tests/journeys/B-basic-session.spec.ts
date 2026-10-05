// Journey B - Basic session (spec lines 588-695, "Journey B"):
//   create session -> send deterministic prompt -> streamed assistant response -> complete
//   -> session appears in history -> switch away/back
import { test, expect } from "@playwright/test";
import { setupJourney, teardownJourney, bootToReadyComposer, evidence, type JourneyEnv } from "./harness";

test.describe("Journey B - basic session", () => {
  let env: JourneyEnv;

  test.beforeEach(async () => {
    env = await setupJourney("B");
  });

  test.afterEach(async () => {
    if (env) await teardownJourney(env);
  });

  test("send a deterministic prompt, see it stream to completion, then find it in history and switch back to it", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);

    // create session (chooseWorkspace already auto-creates/opens one; make it explicit).
    await env.driver.newSession(page);

    // send deterministic prompt
    await env.driver.send(page, "[[scenario:plain]] hello there");
    await evidence(page, testInfo, "01-sent");

    // session appears in history - checked right after send, while the title is still the literal
    // first-message text: the reference separately calls the model to *rename* the session to an
    // AI-generated summary title once the turn settles (reference-behavior-matrix.md "Session
    // title" row), so this is the reliable point to assert the literal text, before it may be
    // overwritten. The human message bubble itself (checked below, post-idle) stays literal forever.
    const sessionList = env.driver.locators.sessionList(page);
    await expect(sessionList).toBeVisible();
    await expect(sessionList.getByText(/hello there/)).toHaveCount(1);

    // streamed assistant response -> complete
    await env.driver.waitForIdle(page, { timeoutMs: 20_000 });
    await evidence(page, testInfo, "02-complete");
    // Composer is empty again once the run settles (a contenteditable in the reference, a real
    // <textarea> in Cognate - normalize on innerText rather than the input-only "value" assertion).
    await expect(async () => {
      const text = await env.driver.locators.composer(page).innerText();
      expect(text.trim()).toBe("");
    }).toPass({ timeout: 5000 });

    // switch away: create a second session, then switch back to the first by index.
    await env.driver.newSession(page);
    await env.driver.send(page, "[[scenario:plain]] a second session");
    await env.driver.waitForIdle(page, { timeoutMs: 20_000 });
    await evidence(page, testInfo, "03-second-session");

    // switch back: reopen the first session (index 1 = second-newest; see Driver.openSession's
    // "0 = newest session" convention) and confirm its transcript is intact.
    await env.driver.openSession(page, 1);
    await page.waitForTimeout(300);
    await evidence(page, testInfo, "04-switched-back");
    await expect(page.getByText(/hello there/).first()).toBeVisible();
  });
});
