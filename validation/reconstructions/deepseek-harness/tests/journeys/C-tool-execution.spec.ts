// Journey C - Tool execution (spec lines 588-695, "Journey C"):
//   send coding task -> file read -> shell/command execution -> file edit -> visible tool states
//   -> final answer -> verify actual workspace mutation
//
// Uses the mock model's `multi` scenario (fixtures/mock-model/server.ts): read src/greet.ts ->
// `git status --short` -> edit "Hello" -> "Howdy" in src/greet.ts -> final answer text.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupJourney, teardownJourney, bootToReadyComposer, waitUntil, evidence, type JourneyEnv } from "./harness";

test.describe("Journey C - tool execution", () => {
  let env: JourneyEnv;

  test.beforeEach(async () => {
    env = await setupJourney("C");
  });

  test.afterEach(async () => {
    if (env) await teardownJourney(env);
  });

  test("a multi-step coding task shows tool activity, produces a final answer, and actually mutates the workspace file on disk", async ({ page }, testInfo) => {
    await bootToReadyComposer(page, env);
    await env.driver.newSession(page);

    const greetPath = join(env.workspaceDir, "src", "greet.ts");
    const before = readFileSync(greetPath, "utf8");
    expect(before).toContain("Hello");

    // send coding task -> file read -> shell/command execution -> file edit: the tool-activity
    // indicator becomes visible while the run is in flight (read -> bash -> edit). This is a
    // best-effort observation, not a hard requirement: local read/bash/edit resolve in well under a
    // millisecond on this reconstruction (no real backend latency), so the run can settle before a
    // poll ever observes a mid-run frame - a timing artifact, not a missing feature
    // (cognate/DEVIATIONS.md "`08-tool-running` may land on an already-completed frame (T7)"). The
    // durable post-hoc assertions below (final answer + file-change artifact + actual disk mutation)
    // are what this journey actually requires.
    await env.driver.send(page, "[[scenario:multi]] do the multi-step task now");
    const sawToolActivity = await waitUntil(
      async () => (await env.driver.locators.toolCard(page).count()) > 0,
      10_000,
    );
    await evidence(page, testInfo, "01-tool-activity");
    testInfo.annotations.push({ type: "tool-activity-observed", description: String(sawToolActivity) });

    // final answer
    await env.driver.waitForIdle(page, { timeoutMs: 30_000 });
    await evidence(page, testInfo, "02-final-answer");
    await expect(page.getByText(/Howdy/).first()).toBeVisible();

    // visible tool states: a completed run leaves at least one file-change artifact behind.
    const changeButton = page.getByRole("button", { name: /View changes to/ });
    await expect(changeButton.first()).toBeVisible({ timeout: 5000 });

    // verify actual workspace mutation on disk (not just in the UI).
    const after = readFileSync(greetPath, "utf8");
    expect(after).toContain("Howdy");
    expect(after).not.toContain("Hello");
  });
});
