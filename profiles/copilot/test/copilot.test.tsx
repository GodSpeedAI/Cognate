// CG-PRF-002 (spec §29.1, §40.J): Copilot acceptance behaviours as a composition of existing primitives.
// setup-dom must be imported first: `screen`/`render` bind to `document` at import time, and ES module
// imports are hoisted above ordinary statements, so happy-dom must be registered from a module imported
// before @testing-library/react (mirrors packages/react/test/setup-dom.ts, CG-UI-001). It backs only the
// ArtifactViewer assertion below, which needs `useArtifact`'s effect-driven fetch to actually run — a
// `renderToString` pass never runs effects, so it cannot observe fetched artifact bytes (test mechanics only;
// no assertion below was changed).
import { GlobalRegistrator } from "./setup-dom.ts";
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { EventSchema } from "@ag-ui/core/schemas";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import type { ModelRequest } from "@cognate/capabilities";
import { createClient, type CognateClient, type RunState } from "@cognate/client";
import { resolveProfile } from "@cognate/profile";
import { localProvider } from "@cognate/provider-local";
import { CognateProvider } from "@cognate/react";
import { alice } from "@cognate/runtime-api/conformance";
import { ArtifactViewer } from "@cognate/ui-astryx";
import { COPILOT_AGENT, copilotProfile, copilotRegistry, createCopilotApp, GenerativeSurface, type CopilotApp } from "../src/index.tsx";

const dir = mkdtempSync(join(tmpdir(), "cognate-copilot-"));
afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  // React schedules follow-up work on a macrotask. Unmount and let it run while `window` still exists;
  // otherwise it can fire after unregister() and surface as an unhandled "window is not defined" error that
  // fails the whole file (flaky under load, observed ~1 run in 4). Test mechanics only; no assertion changed.
  cleanup();
  for (let tick = 0; tick < 3; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  // Unregister so happy-dom's global fetch/Request/Response don't leak into later test files run in the
  // same `bun test` process (mirrors packages/ui-astryx/test/surfaces.test.tsx).
  await GlobalRegistrator.unregister();
});

/** Scripted model: quote (backend tool) → focus map (frontend tool) → approve refund (approval-gated tool) → final answer. */
const lastTool = (r: ModelRequest) => [...r.messages].reverse().find((m) => m.role === "tool");
const model = localProvider({
  id: "copilot-script",
  chunkSize: 6,
  rules: [
    {
      respond: (r) => {
        const tool = lastTool(r);
        if (!tool) return { message: { role: "assistant", content: "" }, toolCalls: [{ id: "t1", name: "billing.quote", arguments: { amount: 21 } }], finishReason: "tool_calls" };
        if (tool.toolCallId === "t1") return { message: { role: "assistant", content: "" }, toolCalls: [{ id: "t2", name: "map.focus", arguments: { city: "Lisbon" } }], finishReason: "tool_calls" };
        if (tool.toolCallId === "t2") return { message: { role: "assistant", content: "" }, toolCalls: [{ id: "t3", name: "refund.approve", arguments: { amount: 42 } }], finishReason: "tool_calls" };
        return { message: { role: "assistant", content: `Refund of 42 processed: ${tool.content}` }, toolCalls: [], finishReason: "stop" };
      },
    },
  ],
});

async function app(store: string): Promise<CopilotApp> {
  return createCopilotApp({
    store,
    model,
    instructions: "You are a support copilot.",
    backendTools: [
      { contract: { id: "billing.quote", version: "1.0.0" }, description: "Quote a refund", inputSchema: { type: "object" }, handler: (i) => ({ total: (i as { amount: number }).amount * 2 }) },
      {
        contract: { id: "refund.approve", version: "1.0.0" },
        description: "Issue a refund",
        inputSchema: { type: "object" },
        handler: (i) => ({ refunded: (i as { amount: number }).amount }),
        requiresApproval: true,
        statePatch: (i) => [{ op: "add", path: "/refund", value: { amount: (i as { amount: number }).amount, status: "refunded" } }],
        render: (i) => ({ component: "RefundCard", props: { amount: (i as { amount: number }).amount } }),
        artifact: (i, o) => ({ name: "refund-receipt.json", mediaType: "application/json", content: JSON.stringify({ request: i, result: o }) }),
      },
    ],
    frontendTools: [{ name: "map.focus", description: "Focus the map", inputSchema: { type: "object" } }],
  });
}

const until = async (read: () => RunState, ok: (s: RunState) => boolean, what: string) => {
  const start = Date.now();
  while (!ok(read())) {
    if (Date.now() - start > 8000) throw new Error(`timed out: ${what}: ${JSON.stringify(read())}`);
    await Bun.sleep(10);
  }
  return read();
};

describe("Copilot profile (§29.1)", () => {
  test("the profile is a pure composition of registered components", () => {
    const resolved = resolveProfile(copilotProfile, copilotRegistry);
    expect(resolved.unresolved).toEqual([]);
    expect(copilotProfile.components).toEqual(expect.arrayContaining(["runtime", "runs", "continuations", "frontend-capabilities", "state-projections", "artifact-projections", "ag-ui", "react", "astryx"]));
  });

  test("streamed response, backend + frontend tools, approval, shared state, artifact, generative UI, and resume across restart", async () => {
    const store = join(dir, "copilot.sqlite");
    let copilot = await app(store);
    let client: CognateClient = createClient({ service: copilot.runtime.service, caller: alice });
    const focused: unknown[] = [];
    let stop = client.provideCapability("map.focus", (input) => (focused.push(input), { centered: true }));
    const { runId } = await client.startRun(COPILOT_AGENT, { message: "I was double charged" });

    // Frontend tool served by the client, then the run waits for human approval of the backend tool.
    let state = await until(() => client.run(runId).get(), (s) => s.openContinuations.some((c) => c.type.includes("approval")), "approval");
    expect(focused).toEqual([{ city: "Lisbon" }]);
    const approval = state.openContinuations.find((c) => c.type.includes("approval"))!;
    expect(approval.payload).toMatchObject({ capability: "refund.approve", input: { amount: 42 } });

    // Resumable interaction: restart the whole application while waiting.
    stop();
    await client.close();
    await copilot.close();
    copilot = await app(store);
    client = createClient({ service: copilot.runtime.service, caller: alice });
    stop = client.provideCapability("map.focus", () => ({ centered: true }));
    await client.resolveContinuation(approval.id, "resume", { approved: true });
    state = await until(() => client.run(runId).get(), (s) => s.status === "completed", "completed");

    // Streamed agent response arrives as ordered deltas that reassemble the final message.
    const deltas = (await Array.fromAsync(copilot.runtime.service.events(alice, { runId }))).filter((e) => e.eventType === "message.delta");
    expect(deltas.length).toBeGreaterThan(3);
    expect(state.text).toContain('Refund of 42 processed: {"refunded":42}');

    // Shared application state is derived from events.
    expect(state.state).toMatchObject({ refund: { amount: 42, status: "refunded" } });

    // Artifact rendering and generative UI projection (SSR through the reference renderer).
    expect(state.artifacts).toHaveLength(1);
    // `useArtifact` fetches artifact bytes from an effect; a plain `renderToString` pass never runs effects
    // (matches packages/ui-astryx/test/surfaces.test.tsx, which uses the same DOM render + waitFor for a
    // populated ArtifactViewer). Rendered here through the DOM so the fetch actually completes.
    const artifactView = render(<CognateProvider client={client}><ArtifactViewer artifactId={state.artifacts[0]} /></CognateProvider>);
    // The receipt (application/json) must actually render as content, not a loading placeholder.
    await waitFor(() => expect(artifactView.container.textContent).toContain("refunded"), { timeout: 5000 });
    artifactView.unmount();
    const components = { RefundCard: (props: unknown) => <section aria-label="refund-card">{JSON.stringify(props)}</section> };
    const events = await Array.fromAsync(copilot.runtime.service.events(alice, { runId }));
    expect(events.some((e) => e.eventType === "ui.render" && (e.payload as { component: string }).component === "RefundCard")).toBe(true);
    const generative = await new Promise<string>((resolve) => {
      const html = () => renderToString(<CognateProvider client={client}><GenerativeSurface runId={runId} components={components} /></CognateProvider>);
      const start = Date.now();
      const tick = () => (html().includes("refund-card") || Date.now() - start > 3000 ? resolve(html()) : setTimeout(tick, 20));
      tick();
    });
    expect(generative).toContain("refund-card");
    stop();
    await client.close();
    await copilot.close();
  }, 30_000);

  test("the same copilot run is observable as AG-UI-compatible output", async () => {
    const copilot = await app(":memory:");
    const response = await copilot.agUi(new Request("http://copilot/agui", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer tenant-a:alice" },
      body: JSON.stringify({ threadId: "t", runId: "r", messages: [{ id: "u", role: "user", content: "I was double charged" }], tools: [], context: [], state: {}, forwardedProps: {} }),
    }));
    const text = await response.text();
    const events = text.split("\n\n").map((chunk) => chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")).filter(Boolean).map((d) => JSON.parse(d));
    expect(events.length).toBeGreaterThan(3);
    expect(events.every((e) => EventSchema.safeParse(e).success)).toBe(true);
    expect(events[0].type).toBe("RUN_STARTED");
    expect(events.some((e) => e.type === "TOOL_CALL_START" && e.toolCallName === "map.focus")).toBe(true);
    await copilot.close();
  });
});
