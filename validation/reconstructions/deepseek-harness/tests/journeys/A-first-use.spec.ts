// Journey A - First use (spec lines 588-695, "Journey A"):
//   launch -> initial UI -> model configuration -> choose workspace -> composer becomes available
import { test, expect } from "@playwright/test";
import { setupJourney, teardownJourney, evidence, waitUntil, type JourneyEnv } from "./harness";

/** Durable events from the app's Connect `StreamEvents` RPC (replays the full log, then ends).
 *  Uses the dev bearer token the app accepts for the local operator (`local:operator`). The payload is
 *  a `google.protobuf.Value`, so it arrives as plain JSON. Framing follows the Connect protocol: each
 *  message is a 1-byte flags field, a 4-byte big-endian length, then JSON; flag 0x02 ends the stream. */
async function durableEvents(port: number): Promise<{ eventType: string; payload: Record<string, unknown> }[]> {
  const body = new TextEncoder().encode("{}");
  const frame = new Uint8Array(5 + body.length);
  new DataView(frame.buffer).setUint32(1, body.length);
  frame.set(body, 5);
  const res = await fetch(`http://127.0.0.1:${port}/cognate.v1.RuntimeService/StreamEvents`, {
    method: "POST",
    headers: { "content-type": "application/connect+json", "connect-protocol-version": "1", authorization: "Bearer local:operator" },
    body: frame,
  });
  if (!res.ok) throw new Error(`StreamEvents HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const decoder = new TextDecoder();
  const out: { eventType: string; payload: Record<string, unknown> }[] = [];
  for (let i = 0; i + 5 <= buf.length; ) {
    const flags = buf[i]!;
    const len = view.getUint32(i + 1);
    const text = decoder.decode(buf.subarray(i + 5, i + 5 + len));
    i += 5 + len;
    if (flags & 0x02) {
      const end = JSON.parse(text) as { error?: { message?: string } };
      if (end.error) throw new Error(`StreamEvents failed: ${end.error.message ?? "unknown"}`);
      break;
    }
    const event = JSON.parse(text) as { eventType?: string; event_type?: string; payload?: Record<string, unknown> };
    out.push({ eventType: event.eventType ?? event.event_type ?? "", payload: event.payload ?? {} });
  }
  return out;
}

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

  // DEBT-029: the wizard's protocol dropdown is driven in the browser (not only at the server), and the
  // durable `model.configured` fact must record the protocol the operator selected.
  test("Settings -> Models wizard: selecting Anthropic Messages saves and records protocol anthropic-messages", async ({ page }, testInfo) => {
    await env.driver.authenticateRaw(page);
    await env.driver.dismiss(page, "Continue");
    await env.driver.dismiss(page, "Configure later");

    await env.driver.openSettingsModels(page);
    await page.getByRole("button", { name: "Add model provider", exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole("tab", { name: "Custom model API", exact: true }).click();
    await page.waitForTimeout(150);
    await page.getByLabel("Provider ID", { exact: true }).fill("mock-model");
    await page.getByLabel("Display name", { exact: true }).fill("Mock Model");
    await page.getByLabel("Base URL", { exact: true }).fill(env.mockModelBaseUrl);
    // The protocol select is wrapped by its "API protocol" label, so match its name loosely.
    const protocol = page.getByRole("combobox", { name: /API protocol/ });
    await protocol.selectOption("Anthropic Messages");
    await expect(protocol).toHaveValue("Anthropic Messages");
    await page.getByLabel("API key", { exact: true }).fill("dummy-key-12345");
    await page.getByRole("button", { name: "Add model", exact: true }).click();
    await page.waitForTimeout(100);
    await page.getByLabel("Model 1 ID", { exact: true }).fill("mock-model-1");
    await page.getByLabel("Model 1 display name", { exact: true }).fill("Mock Model 1");
    await evidence(page, testInfo, "05-anthropic-protocol-selected");
    await page.getByRole("button", { name: "Create provider", exact: true }).click();

    // Durable fact, read back from the event log rather than the UI.
    let configured: { eventType: string; payload: Record<string, unknown> } | undefined;
    await waitUntil(async () => {
      configured = (await durableEvents(env.appPort)).filter((e) => e.eventType === "model.configured").at(-1);
      return configured !== undefined;
    }, 15_000);
    expect(configured, "model.configured event was not recorded").toBeDefined();
    expect(configured!.payload.providerId).toBe("mock-model");
    expect(configured!.payload.protocol).toBe("anthropic-messages");
  });
});
