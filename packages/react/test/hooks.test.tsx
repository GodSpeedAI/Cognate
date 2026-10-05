// CG-UI-001 (spec §25.2): React 19 hooks over the headless client, against a real in-process runtime.
// setup-dom must be imported first: `screen` binds to document.body at import time, and imports are
// hoisted above module statements — a `register()` call between imports runs too late.
import { GlobalRegistrator } from "./setup-dom.ts";
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createClient } from "@cognate/client";
import { type AgentDefinition, invokeFrontend } from "@cognate/runtime-api";
import { alice } from "@cognate/runtime-api/conformance";
import { createRuntime, type Runtime } from "@cognate/runtime-bun";
import type { Projection } from "@cognate/projections";
import { useState } from "react";
import { CognateProvider, useAgent, useArtifact, useCapability, useContinuations, useProjection, useRemoteCapability, useRemoteCapabilityHistory, useSharedState, useThreadSharedState } from "../src/index.tsx";

const agents: AgentDefinition[] = [
  {
    id: "agent.remote",
    version: "1.0.0",
    async run(_input, ctx) {
      const offers = await ctx.remoteOffers("available");
      if (offers.length === 0) return { offered: false, result: null };
      return { offered: true, result: await ctx.invokeRemoteOffer("focus", offers[0]!.id, { city: "Lisbon" }) };
    },
  },
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
  {
    id: "agent.sharedState",
    version: "1.0.0",
    async run(_input, ctx) {
      await ctx.waitFor("go", { type: "state-check", condition: {}, payload: {} });
      return { seen: await ctx.state("seen") };
    },
  },
  {
    id: "agent.threadStateWriter",
    version: "1.0.0",
    async run(_input, ctx) {
      return await ctx.updateSharedState("write", { snapshot: { source: "agent" } });
    },
  },
];
const counter: Projection = { name: "counter", version: "1", apply: (e, s) => (e.eventType === "run.started" ? [{ key: `${e.tenant}/runs`, value: ((s.get(`${e.tenant}/runs`) as number | undefined) ?? 0) + 1 }] : []) };

let runtime: Runtime;
afterEach(async () => {
  cleanup();
  await runtime?.close();
});
// Unregister so happy-dom's global fetch/Response/window don't leak into later test files —
// `bun test` runs every file in one process, and a leaked DOM fetch breaks the Connect servers.
afterAll(async () => {
  await GlobalRegistrator.unregister();
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
    // Queries from render() bind at call time; `screen` binds at import time, before happy-dom registers.
    const screen = render(<CognateProvider client={client}><App onFocus={(i) => focused.push(i)} /></CognateProvider>);
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

  test("useRemoteCapability advertises only while mounted and returns the browser result", async () => {
    runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents });
    const client = createClient({ service: runtime.service, caller: alice });
    const received: unknown[] = [];
    function Editor() {
      const offer = useRemoteCapability({ agent: "agent.remote", contract: { id: "selection.focus", version: "1.0.0" }, description: "Focus selected city", inputSchema: { type: "object" } }, (input) => {
        received.push(input);
        return { focused: true };
      });
      return <span>Editor {offer.status}</span>;
    }
    const view = render(<CognateProvider client={client}><Editor /></CognateProvider>);
    await waitFor(async () => expect(await runtime.service.listRemoteOffers(alice, { agent: "agent.remote" })).toHaveLength(1), { timeout: 5000 });
    await waitFor(() => expect(view.getByText("Editor available")).toBeDefined(), { timeout: 5000 });
    const { runId } = await client.startRun("agent.remote", {});
    await waitFor(async () => expect((await runtime.service.getRun(alice, { runId })).status).toBe("completed"), { timeout: 5000 });
    expect((await runtime.service.getRun(alice, { runId })).output).toEqual({ offered: true, result: { focused: true } });
    expect(received).toEqual([{ city: "Lisbon" }]);
    view.unmount();
    await waitFor(async () => expect(await runtime.service.listRemoteOffers(alice, { agent: "agent.remote" })).toEqual([]), { timeout: 5000 });
    const remounted = render(<CognateProvider client={client}><Editor /></CognateProvider>);
    await waitFor(async () => expect(await runtime.service.listRemoteOffers(alice, { agent: "agent.remote" })).toHaveLength(1), { timeout: 5000 });
    remounted.unmount();
    await client.close();
  });

  test("a remote renderer remains available for its durable call after the offering component unmounts", async () => {
    runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents });
    const client = createClient({ service: runtime.service, caller: alice });
    function Editor() {
      useRemoteCapability(
        { agent: "agent.remote", contract: { id: "selection.focus", version: "1.0.0" }, description: "Focus selected city", inputSchema: { type: "object" } },
        () => ({ focused: true }),
        { render: (record) => <p aria-label="historical-remote-render">{JSON.stringify({ input: record.input, result: record.result, version: record.contractVersion, durable: record.durable })}</p> },
      );
      return <span aria-label="offering">offering</span>;
    }
    function History({ runId }: { readonly runId: string | undefined }) {
      const records = useRemoteCapabilityHistory(runId);
      return <section>{records.map((record) => <span key={`${record.continuationId}@${record.contractVersion}`}>{record.render(record)}</span>)}</section>;
    }
    function App() {
      const { start, runId } = useAgent("agent.remote");
      const [offering, setOffering] = useState(true);
      return <main>
        <button onClick={() => void start({})}>start remote</button>
        <button onClick={() => setOffering(false)}>unmount offering</button>
        {offering ? <Editor /> : null}
        <History runId={runId} />
      </main>;
    }
    const view = render(<CognateProvider client={client}><App /></CognateProvider>);
    await act(async () => view.getByText("start remote").click());
    await waitFor(() => {
      const rendered = JSON.parse(view.getByLabelText("historical-remote-render").textContent ?? "null") as { input: unknown; result: unknown; version: unknown; durable: { waitingPosition?: unknown; terminalPosition?: unknown } };
      expect(rendered).toMatchObject({ input: { city: "Lisbon" }, result: { focused: true }, version: "1.0.0" });
      expect(rendered.durable.waitingPosition).toBeNumber();
      expect(rendered.durable.terminalPosition).toBeNumber();
    }, { timeout: 5000 });
    await act(async () => view.getByText("unmount offering").click());
    expect(view.queryByLabelText("offering")).toBeNull();
    await waitFor(async () => expect(await runtime.service.listRemoteOffers(alice, { agent: "agent.remote" })).toEqual([]), { timeout: 5000 });
    expect(view.getByLabelText("historical-remote-render").textContent).toContain("terminalPosition");
    await client.close();
  });

  test("useRemoteCapability reports rejected publication to the component", async () => {
    runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: ({ action }) => ({ allow: action !== "remote.offer.publish", reason: "offer denied" }) }, agents });
    const client = createClient({ service: runtime.service, caller: alice });
    function Editor() {
      const offer = useRemoteCapability({ agent: "agent.remote", contract: { id: "selection.focus", version: "1.0.0" }, description: "Focus selected city", inputSchema: { type: "object" } }, () => null);
      return <span>{offer.status}: {offer.error?.message ?? ""}</span>;
    }
    const view = render(<CognateProvider client={client}><Editor /></CognateProvider>);
    await waitFor(() => expect(view.getByText("error: offer denied")).toBeDefined(), { timeout: 5000 });
    expect(await runtime.service.listRemoteOffers(alice, { agent: "agent.remote" })).toEqual([]);
    await client.close();
  });

  test("useSharedState reads live shared state and writes it back for a waiting agent to read", async () => {
    runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents });
    const client = createClient({ service: runtime.service, caller: alice });
    function SharedStateApp() {
      const { start, runId, state } = useAgent("agent.sharedState");
      const { state: shared, update } = useSharedState(runId);
      const { open, resolve } = useContinuations(runId);
      return (
        <main>
          <button onClick={() => void start(null)}>start</button>
          <button onClick={() => void update({ snapshot: { flag: true } })}>write</button>
          <p aria-label="shared">{JSON.stringify(shared)}</p>
          <p aria-label="status">{state?.status ?? "none"}</p>
          {open.map((c) => (
            <button key={c.id} onClick={() => void resolve(c.id, "resume")}>go</button>
          ))}
          <p aria-label="output">{JSON.stringify(state?.output ?? null)}</p>
        </main>
      );
    }
    const screen = render(<CognateProvider client={client}><SharedStateApp /></CognateProvider>);
    await act(async () => screen.getByText("start").click());
    await waitFor(() => expect(screen.getByLabelText("status").textContent).toBe("waiting"), { timeout: 5000 });
    await act(async () => screen.getByText("write").click());
    await waitFor(() => expect(screen.getByLabelText("shared").textContent).toBe(JSON.stringify({ flag: true })), { timeout: 5000 });
    await act(async () => (await screen.findByText("go", {}, { timeout: 5000 })).click());
    await waitFor(() => expect(screen.getByLabelText("output").textContent).toBe(JSON.stringify({ seen: { flag: true } })), { timeout: 5000 });
    await client.close();
  });

  test("useThreadSharedState follows caller and agent writes across runs in a thread", async () => {
    runtime = await createRuntime({ store: ":memory:", policy: { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) }, actions: { authorize: () => ({ allow: true, reason: "ok" }) }, agents });
    const client = createClient({ service: runtime.service, caller: alice });
    const threadId = "thread-shared-react";
    function ThreadStateApp() {
      const { state, version, update } = useThreadSharedState(threadId);
      return (
        <main>
          <button onClick={() => void update({ snapshot: { source: "caller" } })}>write caller</button>
          <p aria-label="thread-state">{JSON.stringify(state)}</p>
          <p aria-label="thread-version">{version}</p>
        </main>
      );
    }
    const screen = render(<CognateProvider client={client}><ThreadStateApp /></CognateProvider>);
    await act(async () => screen.getByText("write caller").click());
    await waitFor(() => expect(screen.getByLabelText("thread-state").textContent).toBe(JSON.stringify({ source: "caller" })), { timeout: 5000 });
    await act(async () => {
      await client.startRun("agent.threadStateWriter", null, { correlationId: threadId });
    });
    await waitFor(() => expect(screen.getByLabelText("thread-state").textContent).toBe(JSON.stringify({ source: "agent" })), { timeout: 5000 });
    expect(screen.getByLabelText("thread-version").textContent).toBe("2");
    await client.close();
  });

  test("the react package never imports Astryx", async () => {
    const source = await Bun.file(new URL("../src/index.tsx", import.meta.url)).text();
    expect(source).not.toContain("@astryxdesign");
  });
});
