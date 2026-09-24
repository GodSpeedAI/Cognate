// CG-AGUI-001 (spec §24): outbound mapping matrix, schema-valid events, durable ids, and a real AG-UI consumer.
import { afterEach, describe, expect, test } from "bun:test";
import { EventType } from "@ag-ui/core";
import { HttpAgent } from "@ag-ui/client";
import { ignoredFrameworkEvents, matrix } from "../src/index.ts";
import { type Event, post, setup, types, valid } from "./support.ts";

describe("AG-UI outbound (§24)", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  afterEach(async () => env?.close());

  test("the matrix covers every AG-UI 1.0.0 event type exactly once, with reasons for unsupported ones", () => {
    const all = Object.values(EventType).sort();
    expect(matrix.map((r) => r.agUiType).sort()).toEqual(all);
    for (const row of matrix) if (!row.supported) expect(row.note.length).toBeGreaterThan(0);
    expect(ignoredFrameworkEvents).toContain("run.step.completed");
    expect(ignoredFrameworkEvents).not.toContain("run.artifact");
  });

  test("a run projects to a schema-valid, well-bracketed AG-UI stream mapped to durable events", async () => {
    env = await setup();
    const { events } = await post(env.url, { messages: [{ id: "m1", role: "user", content: "refund please" }] });
    expect(valid(events)).toBe(true);
    const t = types(events);
    expect(t[0]).toBe("RUN_STARTED");
    expect(t.at(-1)).toBe("RUN_FINISHED");
    const start = t.indexOf("TEXT_MESSAGE_START");
    const end = t.indexOf("TEXT_MESSAGE_END");
    expect(start).toBeGreaterThan(0);
    expect(t.slice(start + 1, end).every((x) => x === "TEXT_MESSAGE_CONTENT")).toBe(true);
    expect(events.filter((e) => e.type === "TEXT_MESSAGE_CONTENT").map((e) => e.delta).join("")).toBe("Checking your refund");
    expect(t).toEqual(expect.arrayContaining(["STATE_SNAPSHOT", "STATE_DELTA", "TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT"]));
    expect(events.find((e) => e.type === "STATE_DELTA")!.delta).toEqual([{ op: "replace", path: "/refund/status", value: "awaiting-approval" }]);
    expect(events.find((e) => e.type === "TOOL_CALL_ARGS")!.delta).toBe(JSON.stringify({ amount: 3 }));
    const durable = events.filter((e) => e.type !== "RUN_FINISHED" && e.type !== "CUSTOM");
    for (const e of durable) expect((e.rawEvent as { cognate: { eventId: string; position: number } }).cognate.eventId).toBeString();
    const finished = events.at(-1) as Event & { result: { status: string; continuations: { id: string; type: string }[] } };
    expect(finished.result.status).toBe("waiting");
    expect(finished.result.continuations.map((c) => c.type)).toEqual(["refund-approval"]);
    expect(events.some((e) => e.type === "CUSTOM" && e.name === "cognate.continuation")).toBe(true);
  });

  test("a pinned AG-UI HttpAgent consumer receives and validates the stream", async () => {
    env = await setup();
    const agent = new HttpAgent({ url: env.url, headers: { authorization: "Bearer alice" }, threadId: "t-http" });
    agent.addMessage({ id: "u1", role: "user", content: "refund via http agent" });
    const seen: string[] = [];
    await agent.runAgent({ runId: "r-http" }, { onEvent: ({ event }: { event: { type: string } }) => void seen.push(event.type) });
    expect(seen[0]).toBe("RUN_STARTED");
    expect(seen).toContain("TEXT_MESSAGE_CONTENT");
    expect(seen.at(-1)).toBe("RUN_FINISHED");
    expect(agent.state).toMatchObject({ refund: { status: "awaiting-approval" } });
  });

  test("artifacts are projected as a CUSTOM cognate.artifact event, never dropped", async () => {
    const { createProjector } = await import("../src/index.ts");
    const projector = createProjector({ threadId: "t", runId: "r" });
    const base = { streamId: "run-x", streamSequence: 2, position: 7, recordedAt: "2026-01-01T00:00:00Z", occurredAt: "2026-01-01T00:00:00Z", schemaVersion: 1, tenant: "t", correlationId: "c", causationId: null, runId: "x", scopeId: "root" };
    const out = projector.push({ ...base, eventId: "e-art", eventType: "run.artifact", payload: { artifactId: "art-1", name: "receipt.json", mediaType: "application/json" }, metadata: { artifactId: "art-1" } } as never);
    expect(out).toContainEqual(expect.objectContaining({ type: "CUSTOM", name: "cognate.artifact", value: expect.objectContaining({ artifactId: "art-1" }) }));
  });
});
