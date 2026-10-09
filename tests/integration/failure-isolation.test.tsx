// CG-FAIL-001 (spec §31.4–§31.7): adapter and UI failures never corrupt authoritative state or stop unrelated execution.
// DOM globals must exist before Testing Library loads (see packages/react/test/setup-dom.ts).
import { GlobalRegistrator } from "./setup-dom.ts";
import { afterAll, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Component as ReactComponent, type ReactNode } from "react";
import { entry } from "@godspeedai/cognate-cognitive-api/conformance";
import { createRvfIndex } from "@godspeedai/cognate-cognitive-rvf";
import { createClient } from "@godspeedai/cognate-client";
import { bindCapabilities, loadSemanticProjection } from "@godspeedai/cognate-domainforge";
import { CognateProvider } from "@godspeedai/cognate-react";
import { ObservationDelivery, observationIntent, type ObservationPort } from "@godspeedai/cognate-realitytrace";
import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import { createRuntime } from "@godspeedai/cognate-runtime-bun";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";

const dir = mkdtempSync(join(tmpdir(), "cognate-failure-"));
afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await GlobalRegistrator.unregister();
});
const allow = { authorize: () => ({ allow: true, policyId: "p", reason: "ok" }) };
const actions = { authorize: () => ({ allow: true, reason: "ok" }) };
const echo: AgentDefinition = { id: "agent.echo", version: "1.0.0", run: async (input) => ({ echo: input }) };
const snapshotOf = async (store: { readAll(): Promise<unknown[]> }) => JSON.stringify(await store.readAll());

describe("failure isolation (§31.4–§31.7)", () => {
  test("§31.4 a failed RVF snapshot corrupts neither the active cognitive index nor the event store", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [{ streamId: "s", expectedVersion: 0, events: [(await import("@godspeedai/cognate-events/conformance")).event("fact.recorded", { n: 1 })] }] });
    const before = await snapshotOf(store);
    const index = await createRvfIndex({ dimension: 4, path: join(dir, "active.rvf") });
    await index.upsert([entry("a", [1, 0, 0, 0]), entry("b", [0, 1, 0, 0])]);
    const hits = await index.similar({ vector: Float32Array.from([1, 0, 0, 0]), k: 2, tenant: "tenant-a" });
    const base = { name: "snap", lineage: "app", frameworkVersion: "0", onBehind: "fail" as const };
    await expect(index.snapshot(store, { ...base, dir: "/proc/not/writable", indexedThrough: 1, storeHead: 1 })).rejects.toThrow();
    await expect(index.snapshot(store, { ...base, dir: join(dir, "lag"), indexedThrough: 0, storeHead: 1 })).rejects.toThrow();
    expect(await index.similar({ vector: Float32Array.from([1, 0, 0, 0]), k: 2, tenant: "tenant-a" })).toEqual(hits);
    expect(await index.count()).toBe(2);
    expect(await snapshotOf(store)).toBe(before);
    expect(await store.listRecords("rvf_snapshots")).toEqual([]);
    await index.close();
  });

  test("§31.5 an unavailable semantic projection leaves dependent components waiting; no fallback grammar, other work continues", async () => {
    const broken = loadSemanticProjection('Entity "Warehouse" in', { uri: "file:///broken.sea" });
    expect(broken.ok).toBe(false);
    const good = loadSemanticProjection('Entity "Warehouse" in logistics', { uri: "file:///good.sea" });
    if (!good.ok) throw new Error("fixture");
    const [contract] = bindCapabilities(good.projection, [{ semanticId: "logistics::Warehouse", capability: { id: "warehouse.read", version: "1.0.0" } }]);
    const runtime = await createRuntime({ store: ":memory:", policy: allow, actions, agents: [echo] });
    // The provider of warehouse.read would come from the broken projection, so it is never mounted.
    const dependent = await runtime.kernel.mount({ id: "stock-report", requires: { warehouse: { capability: contract!.id } }, activate: () => {} });
    await Bun.sleep(30);
    expect(dependent.state).toBe("WAITING");
    const { runId } = await runtime.service.startRun(alice, { agent: "agent.echo", input: 1, idempotencyKey: "e" });
    await runtime.idle();
    expect((await runtime.service.getRun(alice, { runId })).status).toBe("completed");
    await runtime.close();
  });

  test("§31.6 RealityTrace being down never blocks execution or rolls back committed events", async () => {
    const runtime = await createRuntime({
      store: join(dir, "rt-down.sqlite"),
      policy: allow,
      actions,
      agents: [{ id: "agent.tool", version: "1.0.0", run: async (_i, ctx) => ({ v: await ctx.invoke("tool.x", {}) }) }],
      components: [{ id: "x", provides: [{ id: "tool.x", version: "1.0.0" }], activate: (f) => f.provide({ id: "tool.x", version: "1.0.0" }, () => 1) }],
      outboxFor: (e) => (e.eventType === "run.invocation" ? [observationIntent(e, { classification: "durable_fact" })] : []),
    });
    const down: ObservationPort = { id: "down", record: async () => { throw new Error("realitytrace unavailable"); } };
    const delivery = new ObservationDelivery(runtime.store, { port: down, backoff: { baseMs: 1, maxMs: 1, maxAttempts: 2 } });
    const { runId } = await runtime.service.startRun(alice, { agent: "agent.tool", input: null, idempotencyKey: "t" });
    await runtime.idle();
    await delivery.drain();
    await Bun.sleep(5);
    await delivery.drain();
    expect((await runtime.service.getRun(alice, { runId })).status).toBe("completed");
    const invocation = (await runtime.store.readStream(`run-${runId}`)).find((e) => e.eventType === "run.invocation")!;
    expect(await delivery.status(invocation.eventId)).toMatchObject({ state: "failed", lastError: "realitytrace unavailable" });
    expect((await delivery.unreconciled()).map((s) => s.eventId)).toEqual([invocation.eventId]);
    await runtime.close();
  });

  test("§31.7 a UI rendering failure mutates no authoritative state; the application keeps working", async () => {
    {
      const runtime = await createRuntime({ store: ":memory:", policy: allow, actions, agents: [echo] });
      const client = createClient({ service: runtime.service, caller: alice });
      await runtime.service.startRun(alice, { agent: "agent.echo", input: "before", idempotencyKey: "b" });
      await runtime.idle();
      const before = await snapshotOf(runtime.store);
      class Boundary extends ReactComponent<{ children: ReactNode }, { failed: boolean }> {
        override state = { failed: false };
        static getDerivedStateFromError() {
          return { failed: true };
        }
        override render() {
          return this.state.failed ? <p>surface failed</p> : this.props.children;
        }
      }
      const Broken = (): ReactNode => {
        throw new Error("renderer crashed");
      };
      const originalError = console.error;
      console.error = () => {};
      const view = render(<CognateProvider client={client}><Boundary><Broken /></Boundary></CognateProvider>);
      console.error = originalError;
      expect(view.container.textContent).toBe("surface failed");
      expect(await snapshotOf(runtime.store)).toBe(before);
      const after = await client.startRun("agent.echo", "after");
      await runtime.idle();
      expect((await runtime.service.getRun(alice, { runId: after.runId })).status).toBe("completed");
      cleanup();
      await client.close();
      await runtime.close();
    }
  });
});
