// CG-AGUI-003 (spec §24, §31.8): reconnect sends a snapshot then ordered deltas from a cursor, or a full resync.
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alice } from "@cognate/runtime-api/conformance";
import { type Event, post, setup, types, valid } from "./support.ts";

const cursorOf = (events: Event[]) => Math.max(...events.map((e) => (e.rawEvent as { cognate?: { position: number } } | undefined)?.cognate?.position ?? 0));

describe("AG-UI reconnect (§24)", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  afterEach(async () => env?.close());

  test("after a disconnect, resuming from the cursor yields a state snapshot then only newer events", async () => {
    env = await setup();
    const partial = await post(env.url, { messages: [{ id: "m1", role: "user", content: "refund" }] }, { stopAfter: 4 });
    const cursor = cursorOf(partial.events);
    const resumed = await post(env.url, { forwardedProps: { cognate: { cursor } } });
    expect(valid(resumed.events)).toBe(true);
    expect(types(resumed.events)[0]).toBe("STATE_SNAPSHOT");
    const positions = resumed.events.map((e) => (e.rawEvent as { cognate?: { position: number } } | undefined)?.cognate?.position).filter((p): p is number => typeof p === "number" && p > 0);
    expect(positions.every((p) => p > cursor)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const text = [...partial.events, ...resumed.events].filter((e) => e.type === "TEXT_MESSAGE_CONTENT").map((e) => e.delta).join("");
    expect(text).toBe("Checking your refund");
  });

  test("an unknown or expired cursor triggers a full resync", async () => {
    env = await setup();
    await post(env.url, { messages: [{ id: "m1", role: "user", content: "refund" }] });
    const resync = await post(env.url, { forwardedProps: { cognate: { cursor: 999_999 } } });
    expect(types(resync.events).slice(0, 3)).toEqual(["RUN_STARTED", "MESSAGES_SNAPSHOT", "STATE_SNAPSHOT"]);
    expect(resync.events.find((e) => e.type === "STATE_SNAPSHOT")!.snapshot).toEqual({ refund: { amount: 3, status: "awaiting-approval" } });
  });

  test("full resync of a completed run passes historical waits and restores the final result", async () => {
    env = await setup();
    const first = await post(env.url, { messages: [{ id: "m1", role: "user", content: "refund" }] });
    const approval = (first.events.find((e) => e.type === "RUN_FINISHED")!.result as { continuations: { id: string }[] }).continuations[0]!.id;
    const resumed = await post(env.url, { runId: "r-2", forwardedProps: { cognate: { resolve: { continuationId: approval, action: "resume", input: { approved: true } } } } });
    const frontend = resumed.events.find((e) => e.type === "TOOL_CALL_START" && e.toolCallName === "map.focus")!;
    await post(env.url, { runId: "r-3", messages: [{ id: "tool-result", role: "tool", toolCallId: frontend.toolCallId, content: "{}" }] });
    const restored = await post(env.url, { runId: "r-4" });
    expect(types(restored.events)).toContain("RUN_FINISHED");
    expect(restored.events.at(-1)).toMatchObject({ type: "RUN_FINISHED", result: { status: "completed" } });
  });

  test("disconnecting does not cancel the durable run", async () => {
    env = await setup();
    await post(env.url, { messages: [{ id: "m1", role: "user", content: "refund" }] }, { stopAfter: 2 });
    await Bun.sleep(100);
    const runs = (await Array.fromAsync(env.runtime.service.events(alice, {}))).map((e) => e.eventType);
    expect(runs).not.toContain("run.cancelled");
    expect(runs).toContain("run.waiting");
  });

  describe("thread → run mapping is durable, not process memory", () => {
    const dir = mkdtempSync(join(tmpdir(), "cognate-agui-thread-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    const cognateRunOf = (events: Event[]) => (events.find((e) => e.type === "RUN_STARTED")?.rawEvent as { cognate?: { runId?: string } } | undefined)?.cognate?.runId;

    test("after a server restart, a thread still reconnects to its run and can resolve its continuation", async () => {
      const store = join(dir, "restart.sqlite");
      env = await setup(store);
      const first = await post(env.url, { messages: [{ id: "m1", role: "user", content: "refund" }] });
      const waiting = first.events.find((e) => e.type === "RUN_FINISHED")!.result as { status: string; continuations: { id: string }[] };
      expect(waiting.status).toBe("waiting");
      await env.close();

      env = await setup(store);
      const resync = await post(env.url, {});
      expect(types(resync.events)).not.toContain("RUN_ERROR");
      expect(types(resync.events).slice(0, 3)).toEqual(["RUN_STARTED", "MESSAGES_SNAPSHOT", "STATE_SNAPSHOT"]);
      const resolved = await post(env.url, { runId: "r-2", forwardedProps: { cognate: { resolve: { continuationId: waiting.continuations[0]!.id, action: "resume", input: { approved: true } } } } });
      expect(types(resolved.events)).not.toContain("RUN_ERROR");
      expect(resolved.events.some((e) => e.type === "TOOL_CALL_START" && e.toolCallName === "map.focus")).toBe(true);
    });

    test("a thread routes to its most recent run", async () => {
      env = await setup(join(dir, "latest.sqlite"));
      const one = await post(env.url, { runId: "r-1", messages: [{ id: "m1", role: "user", content: "refund" }] });
      const two = await post(env.url, { runId: "r-2", messages: [{ id: "m2", role: "user", content: "refund again" }] });
      const runs = (await Array.fromAsync(env.runtime.service.events(alice, {}))).filter((e) => e.eventType === "run.started").map((e) => e.runId!);
      expect(runs).toHaveLength(2);
      expect(cognateRunOf((await post(env.url, {})).events)).toBe(runs[1]);
      expect(one.status).toBe(200);
      expect(two.status).toBe(200);
    });

    test("another tenant cannot reach a thread by reusing its id", async () => {
      env = await setup(join(dir, "tenant.sqlite"));
      await post(env.url, { messages: [{ id: "m1", role: "user", content: "refund" }] });
      const other = await post(env.url, {}, { token: "eve@tenant-b" });
      expect(types(other.events)).toEqual(["RUN_ERROR"]);
      expect(other.events[0]!.code).toBe("not_found");
    });
  });
});
