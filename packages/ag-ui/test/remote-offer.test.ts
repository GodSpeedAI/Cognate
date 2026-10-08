// CG-AGUI-002 follow-ups (FU-1/FU-3): a generic AG-UI client completes a remote-offer wait by
// replying to the projected tool call, and run-level CUSTOM payloads are self-sufficient.
import { afterEach, describe, expect, test } from "bun:test";
import { alice } from "@godspeedai/runtime-api/conformance";
import { type Event, post, setup, types, valid } from "./support.ts";

const finished = (events: Event[]) => events.at(-1) as Event & { result: { status: string; continuations: { id: string; type: string; version: number }[]; output?: unknown } };

describe("AG-UI remote offers and run-level continuations", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  afterEach(async () => env?.close());

  test("a generic client completes a remote-offer wait by replying to the projected bare toolCallId", async () => {
    env = await setup();
    await env.runtime.service.publishRemoteOffer(alice, {
      leaseId: crypto.randomUUID(),
      agent: "agent.remote",
      contract: { id: "probe.offer", version: "1.0.0" },
      description: "probe offer",
      inputSchema: { type: "object" },
      ttlMs: 30_000,
    });
    const firstPost = await post(env.url, { messages: [{ id: "m1", role: "user", content: "use it" }], forwardedProps: { cognate: { agent: "agent.remote" } } });
    const first = finished(firstPost.events);
    // The remote wait projects as a tool call whose wire id is the bare remote id, and the run
    // stabilizes as waiting with the offer named in the continuations list.
    const toolStart = firstPost.events.find((event) => event.type === "TOOL_CALL_START" && event.toolCallName === "probe.offer") as { toolCallId: string } | undefined;
    expect(toolStart).toBeDefined();
    expect(toolStart!.toolCallId).not.toContain(".wait.");
    expect(first.result.status).toBe("waiting");
    expect(first.result.continuations).toHaveLength(1);
    expect(first.result.continuations[0]!.type).toBe("remote:probe.offer");
    // The standard AG-UI tool-message path (no cognate extension) resumes the wait: the adapter
    // addresses the bare id to the thread's current run's remote continuation.
    const second = await post(env.url, { messages: [{ id: "m2", role: "tool", toolCallId: toolStart!.toolCallId, content: JSON.stringify({ done: 1 }) }] });
    expect(valid(second.events)).toBe(true);
    expect(types(second.events)).toContain("TOOL_CALL_RESULT");
    const result = second.events.find((event) => event.type === "TOOL_CALL_RESULT") as { toolCallId: string; content: string } | undefined;
    expect(result?.toolCallId).toBe(toolStart!.toolCallId);
    expect(JSON.parse(result!.content)).toEqual({ done: 1 });
    expect(finished(second.events).result).toMatchObject({ status: "completed", output: { applied: { done: 1 } } });
  });

  test("run-level CUSTOM payloads are self-sufficient for generic clients", async () => {
    env = await setup();
    const oauthPost = await post(env.url, { messages: [{ id: "m1", role: "user", content: "start oauth" }] });
    const result = finished(oauthPost.events);
    expect(result.result.status).toBe("waiting_unsupported");
    const custom = oauthPost.events.find((event) => event.type === "CUSTOM" && event.name === "cognate.unsupported_interaction") as { value: Record<string, unknown> } | undefined;
    expect(custom).toBeDefined();
    // Everything a generic client needs to act through forwardedProps.cognate.resolve/cancel,
    // without parsing rawEvent: the continuation id, its type/kind, and the run/thread scope.
    expect(custom!.value).toMatchObject({ type: "oauth", kind: "oauth_callback", threadId: "t-1" });
    expect(typeof custom!.value.id).toBe("string");
    expect((custom!.value.id as string).length).toBeGreaterThan(0);
    expect(typeof custom!.value.runId).toBe("string");
    expect((custom!.value.runId as string).length).toBeGreaterThan(0);
  });
});
