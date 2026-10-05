// Journey A - First use (spec lines 588-695, "Journey A"):
//   launch -> initial UI -> model configuration -> choose workspace -> composer becomes available
import { test, expect } from "@playwright/test";
import { setupJourney, teardownJourney, evidence, type JourneyEnv } from "./harness";

test.describe("Journey A - first use", () => {
  let env: JourneyEnv;

  test.beforeEach(async () => {
    env = await setupJourney("A");
  });

  test.afterEach(async () => {
    if (env) await teardownJourney(env);
  });

  test("launch shows initial UI with no workspace yet, then model config + workspace selection enable the composer", async ({ page }, testInfo) => {
    // launch -> initial UI: navigate without dismissing first-run dialogs (both systems show a
    // first-run dialog pair on a fresh home dir - reference-behavior-matrix.md §1; cognate mirrors
    // it deliberately, cognate/DEVIATIONS.md critic round-1 P0-1).
    await env.driver.authenticateRaw(page);
    await evidence(page, testInfo, "01-initial-ui");

    // No composer yet - no workspace has been chosen in this fresh home dir.
    await expect(env.driver.locators.composer(page)).toHaveCount(0);

    // Dismiss the first-run dialog pair (idempotent no-op if a system has none left to dismiss).
    await env.driver.dismiss(page, "Continue");
    await env.driver.dismiss(page, "Configure later");
    await evidence(page, testInfo, "02-no-workspace-shell");
    await expect(env.driver.locators.composer(page)).toHaveCount(0);

    // model configuration
    await env.driver.openSettingsModels(page);
    await env.driver.configureModel(page, { baseUrl: env.mockModelBaseUrl, apiKey: "dummy-key-12345", protocol: "openai-completions" });
    const closeSettings = page.getByRole("button", { name: /^Close(?: settings)?$/, exact: false });
    if ((await closeSettings.count()) > 0) await closeSettings.first().click();
    await page.waitForTimeout(200);
    await evidence(page, testInfo, "03-model-configured");

    // choose workspace
    await env.driver.chooseWorkspace(page, env.workspaceDir);
    await evidence(page, testInfo, "04-workspace-chosen");

    // composer becomes available
    const composer = env.driver.locators.composer(page);
    await expect(composer).toBeVisible({ timeout: 10_000 });
    await expect(composer).toBeEnabled();
  });
});
