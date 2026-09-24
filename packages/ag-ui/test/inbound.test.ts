// CG-AGUI-002 (spec §24, §32): inbound actions pass through native authentication, authorization, and idempotency.
import { afterEach, describe, expect, test } from "bun:test";
import { alice } from "@cognate/runtime-api/conformance";
import { type Event, post, setup, types, valid } from "./support.ts";

const user = (content: string) => ({ messages: [{ id: "m1", role: "user", content }] });
const finished = (events: Event[]) => events.at(-1) as Event & { result: { status: string; continuations: { id: string; type: string; version: number }[]; output?: unknown } };

describe("AG-UI inbound (§24)", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  afterEach(async () => env?.close());

  test("unauthenticated requests are refused; unauthorized actors get RUN_ERROR, not a run", async () => {
    env = await setup();
    expect((await post(env.url, user("hi"), { token: null })).status).toBe(401);
    const denied = await post(env.url, { ...user("hi"), runId: "r-m" }, { token: "mallory" });
    expect(types(denied.events)).toEqual(["RUN_ERROR"]);
    expect(denied.events[0]).toMatchObject({ code: "permission_denied" });
  });

  test("the same AG-UI run id starts one durable run", async () => {
    env = await setup();
    await post(env.url, user("hi"));
    await post(env.url, user("hi"));
    const runs = (await Array.fromAsync(env.runtime.service.events(alice, {}))).filter((e) => e.eventType === "run.started");
    expect(runs).toHaveLength(1);
  });

  test("approval and frontend tool results resume the run through the service", async () => {
    env = await setup();
    const first = finished((await post(env.url, user("refund"))).events);
    const approval = first.result.continuations[0]!;
    const second = await post(env.url, { forwardedProps: { cognate: { resolve: { continuationId: approval.id, action: "resume", input: { approved: true }, expectedVersion: approval.version } } } });
    expect(valid(second.events)).toBe(true);
    const toolStart = second.events.find((e) => e.type === "TOOL_CALL_START" && e.toolCallName === "map.focus")!;
    expect(toolStart).toBeDefined();
    const third = await post(env.url, { messages: [{ id: "m2", role: "tool", toolCallId: toolStart.toolCallId, content: JSON.stringify({ centered: true }) }] });
    expect(finished(third.events).result).toMatchObject({ status: "completed", output: { approved: true, focus: { centered: true } } });
  });

  test("cancellation is an authorized inbound action", async () => {
    env = await setup();
    await post(env.url, user("refund"));
    const cancelled = await post(env.url, { forwardedProps: { cognate: { cancel: { reason: "user closed" } } } });
    expect(types(cancelled.events).at(-1)).toBe("RUN_ERROR");
    expect(cancelled.events.at(-1)).toMatchObject({ code: "cancelled" });
  });

  test("a continuation with no faithful AG-UI representation is reported as unsupported, not completed", async () => {
    env = await setup();
    const { events } = await post(env.url, user("login with oauth"));
    expect(events.some((e) => e.type === "CUSTOM" && e.name === "cognate.unsupported_interaction")).toBe(true);
    expect(finished(events).result.status).toBe("waiting_unsupported");
  });
});
