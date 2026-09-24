// CG-UI-001 (spec §25.2): React 19 hooks over the headless client, against a real in-process runtime.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createClient } from "@cognate/client";
import { type AgentDefinition, invokeFrontend } from "@cognate/runtime-api";
import { alice } from "@cognate/runtime-api/conformance";
import { createRuntime, type Runtime } from "@cognate/runtime-bun";
import type { Projection } from "@cognate/projections";
import { CognateProvider, useAgent, useArtifact, useCapability, useContinuations, useProjection } from "../src/index.tsx";

const agents: AgentDefinition[] = [
  {
    id: "agent.ui",
    version: "1.0.0",
    async run(input, ctx) {
      for (const w of ["Hello ", "from ", "the agent"]) await ctx.emit("message.delta", { text: w });
      const ok = (await ctx.waitFor("approve", { type: "approval", condition: { kind: "human_approval" }, payload: input })) as { approved: boolean };
      const place = await invokeFrontend(ctx, "focus", "map.focus", { city: "Lisbon" });
      const artifactId = await ctx.artifact({ name: "summary.md", mediaType: "text/markdown", bytes: new TextEncoder().encode("# Summary") });
      return { ok: ok.approved, place, artifactId };
    },
  },
];
const counter: Projection = { name: "counter", version: "1", apply: (e, s) => (e.eventType === "run.started" ? [{ key: `${e.tenant}/runs`, value: ((s.get(`${e.tenant}/runs`) as number | undefined) ?? 0) + 1 }] : []) };

let runtime: Runtime;
afterEach(async () => {
  cleanup();
  await runtime?.close();
});

function App({ onFocus }: { onFocus: (input: unknown) => void }) {
  const { start, state, runId } = useAgent("agent.ui");
  const { open, resolve } = useContinuations(runId);
  const runs = useProjection("counter");
  useCapability("map.focus", (input) => (onFocus(input), { centered: true }));
  const artifact = useArtifact((state?.output as { artifactId?: string } | null)?.artifactId);
  return (
    <main>
      <button onClick={() => void start({ amount: 1 })}>start</button>
      <p aria-label="text">{state?.text ?? ""}</p>
      <p aria-label="status">{state?.status ?? "none"}</p>
      <p aria-label="runs">{String(runs?.find((r) => r.key === "runs")?.value ?? 0)}</p>
      {open.filter((c) => c.type === "approval").map((c) => (
        <button key={c.id} onClick={() => void resolve(c.id, "resume", { approved: true })}>approve</button>
      ))}
      <p aria-label="artifact">{artifact.status === "ready" ? artifact.text : artifact.status}</p>
    </main>
  );
}

describe("React bindings (§25.2)", () => {
  test("streamed text, approval, frontend capability, projection, and artifact flow through hooks", async () => {
    runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents, projections: [{ projection: counter, public: true }] });
    const client = createClient({ service: runtime.service, caller: alice });
    const focused: unknown[] = [];
    render(<CognateProvider client={client}><App onFocus={(i) => focused.push(i)} /></CognateProvider>);
    await act(async () => screen.getByText("start").click());
    await waitFor(() => expect(screen.getByLabelText("text").textContent).toBe("Hello from the agent"), { timeout: 5000 });
    await waitFor(() => expect(screen.getByLabelText("runs").textContent).toBe("1"), { timeout: 5000 });
    await act(async () => (await screen.findByText("approve", {}, { timeout: 5000 })).click());
    await waitFor(() => expect(screen.getByLabelText("status").textContent).toBe("completed"), { timeout: 5000 });
    expect(focused).toEqual([{ city: "Lisbon" }]);
    await waitFor(() => expect(screen.getByLabelText("artifact").textContent).toBe("# Summary"), { timeout: 5000 });
    await client.close();
  });

  test("useCapability unregisters on unmount: the frontend continuation stays open", async () => {
    runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents });
    const client = createClient({ service: runtime.service, caller: alice });
    function Provider() {
      useCapability("map.focus", () => ({ centered: true }));
      return null;
    }
    const view = render(<CognateProvider client={client}><Provider /></CognateProvider>);
    view.unmount();
    const { runId } = await client.startRun("agent.ui", { amount: 1 });
    await waitFor(async () => expect((await runtime.service.listContinuations(alice, { runId })).length).toBe(1), { timeout: 5000 });
    const [c] = await runtime.service.listContinuations(alice, { runId });
    await runtime.service.resolveContinuation(alice, { continuationId: c!.id, action: "resume", input: { approved: true }, idempotencyKey: "a" });
    await waitFor(async () => expect((await runtime.service.listContinuations(alice, { runId, status: "OPEN" })).map((x) => x.type)).toEqual(["frontend:map.focus"]), { timeout: 5000 });
    await Bun.sleep(100);
    expect((await runtime.service.getRun(alice, { runId })).status).toBe("waiting");
    await client.close();
  });

  test("the react package never imports Astryx", async () => {
    const source = await Bun.file(new URL("../src/index.tsx", import.meta.url)).text();
    expect(source).not.toContain("@astryxdesign");
  });
});
