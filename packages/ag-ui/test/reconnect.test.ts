// CG-AGUI-003 (spec §24, §31.8): reconnect sends a snapshot then ordered deltas from a cursor, or a full resync.
import { afterEach, describe, expect, test } from "bun:test";
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

  test("disconnecting does not cancel the durable run", async () => {
    env = await setup();
    await post(env.url, { messages: [{ id: "m1", role: "user", content: "refund" }] }, { stopAfter: 2 });
    await Bun.sleep(100);
    const runs = (await Array.fromAsync(env.runtime.service.events(alice, {}))).map((e) => e.eventType);
    expect(runs).not.toContain("run.cancelled");
    expect(runs).toContain("run.waiting");
  });
});
