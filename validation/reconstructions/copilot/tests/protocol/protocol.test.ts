// Gate: CopilotKit reconstruction — Phase 10 "AG-UI Wire Compatibility" (settlement gate 19).
//
// Gate command (green standalone from a cold start; no Playwright, no fixed ports, no external
// service — the reconstruction server is started here on an ephemeral port with a throwaway home):
//
//   cd /home/sprime01/projects/cognate/validation/reconstructions/copilot && bun test tests/protocol/
//
// What is proven, against the REAL reconstruction endpoint (cognate/src/server.ts wiring
// @godspeedai/cognate-ag-ui's createAgUiHandler, with every canonical journey agent registered):
//   - a standards-compliant AG-UI participant (an SSE client holding only the pinned
//     @ag-ui/core schemas, plus the official @ag-ui/client HttpAgent) interoperates fully;
//   - every received frame validates against the pinned EventSchema;
//   - the event classes exercised by the reference arrive with correct ordering:
//     RUN_STARTED/RUN_FINISHED, TEXT_MESSAGE_START/CONTENT/END,
//     TOOL_CALL_START/ARGS/END/RESULT, STATE_SNAPSHOT/STATE_DELTA, and the CUSTOM
//     events the journeys emit (the J-G runtime-interrupt payload);
//   - the RunAgentInput field set and shapes are the pinned reference wire shapes
//     (reference/logs/runs/run-req-J-A-00.json), used verbatim.
// CopilotKit absence is proven mechanically in purity.test.ts, not claimed here.
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { threadCorrelationId } from "@godspeedai/cognate-ag-ui";
import { startServer, type AppServer } from "../../cognate/src/server.ts";
import { CONTINUATION_MESSAGE, JOURNEY_F_AGENT, JOURNEY_G_AGENT, JOURNEY_K_AGENT, LIVE_RECOVERY_CHUNKS } from "../../cognate/src/remaining-journeys.ts";
import { JOURNEY_B_AGENT } from "../../cognate/src/constants.ts";
import { loadAgUiClient, RunAgentInputSchema, type AgUiEvent } from "./agui-modules.ts";
import { eventsOf, durablePosition, postRunAgentInput, SUITE_ACTOR, suiteCaller, typesOf } from "./sse.ts";

// Pinned reference wire archive: the exact RunAgentInput the reference application sent.
const REFERENCE_REQUEST = join(import.meta.dir, "../../reference/logs/runs/run-req-J-A-00.json");
const DETERMINISTIC_REPLY = "Hello from the deterministic Cognate chat.";

let home: string;
let app: AppServer;
let endpoint: string;

beforeAll(
  async () => {
    home = mkdtempSync(join(tmpdir(), "cognate-agui-protocol-"));
    app = await startServer({ port: 0, home: join(home, "data") });
    endpoint = `${app.url}/agui`;
  },
  60_000,
);

afterAll(async () => {
  await app?.stop();
  if (home) rmSync(home, { recursive: true, force: true });
});

const baseInput = { tools: [], context: [], state: {}, forwardedProps: {}, messages: [] };

/** A fresh AG-UI request for one journey; the user message is the agent's run input. */
function runInput(threadId: string, runId: string, agent: string | undefined, message: string): Record<string, unknown> {
  return {
    ...baseInput,
    threadId,
    runId,
    messages: [{ id: `${runId}-user`, role: "user", content: message }],
    ...(agent === undefined ? {} : { forwardedProps: { cognate: { agent } } }),
  };
}

async function stream(input: Record<string, unknown>, options?: { stopWhen?: (event: AgUiEvent) => boolean }): Promise<Awaited<ReturnType<typeof postRunAgentInput>>> {
  const result = await postRunAgentInput(endpoint, input, options);
  expect(result.schemaFailures).toEqual([]);
  return result;
}

/** Text-message bracketing: one START, only CONTENT between START and END, deltas reassemble. */
function expectBracketedText(events: readonly AgUiEvent[], expected: string): void {
  const types = typesOf(events);
  const start = types.indexOf("TEXT_MESSAGE_START");
  const end = types.indexOf("TEXT_MESSAGE_END");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  expect(eventsOf(events, "TEXT_MESSAGE_START")).toHaveLength(1);
  expect(eventsOf(events, "TEXT_MESSAGE_END")).toHaveLength(1);
  expect(types.slice(start + 1, end).every((type) => type === "TEXT_MESSAGE_CONTENT")).toBe(true);
  expect(
    eventsOf(events, "TEXT_MESSAGE_CONTENT")
      .map((event) => event.delta)
      .join(""),
  ).toBe(expected);
}

/** The adapter projects durable events with provenance: rawEvent.cognate { eventId, position, runId }. */
function expectDurableProvenance(events: readonly AgUiEvent[]): void {
  for (const event of events) {
    if (event.rawEvent === undefined) continue;
    const cognate = (event.rawEvent as { cognate?: { eventId?: unknown; position?: unknown; runId?: unknown } }).cognate;
    expect(cognate).toBeDefined();
    expect(typeof cognate!.eventId).toBe("string");
    expect(typeof cognate!.position).toBe("number");
    expect(typeof cognate!.runId).toBe("string");
  }
}

describe("AG-UI wire interop with no CopilotKit present (Phase 10, gate 19)", () => {
  test("the pinned reference RunAgentInput shape streams a schema-valid run through the reconstruction endpoint", async () => {
    const archive = await Bun.file(REFERENCE_REQUEST).json();
    // The reference request's field set and value shapes are sent verbatim; only threadId/runId
    // are suite-local. Nothing about the input is invented: the archive is the ground truth.
    expect(archive.messages).toHaveLength(1);
    expect(archive.messages[0].role).toBe("user");
    const input = {
      threadId: "proto-pinned",
      runId: "proto-pinned-1",
      tools: archive.tools,
      context: archive.context,
      forwardedProps: archive.forwardedProps,
      state: archive.state,
      messages: archive.messages,
    };
    expect(Object.keys(input).sort()).toEqual(Object.keys(archive).sort());
    expect(RunAgentInputSchema.safeParse(input).success).toBe(true);

    const result = await stream(input);
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/event-stream");

    const types = typesOf(result.events);
    expect(types[0]).toBe("RUN_STARTED");
    expect(types.at(-1)).toBe("RUN_FINISHED");
    expectBracketedText(result.events, DETERMINISTIC_REPLY);
    const finished = result.events.at(-1)!;
    expect((finished.result as { status?: string }).status).toBe("completed");
    expectDurableProvenance(result.events);
  });

  test("the official @ag-ui/client HttpAgent — a normal AG-UI participant — completes a run", async () => {
    const { HttpAgent } = await loadAgUiClient();
    const agent = new HttpAgent({ url: endpoint, headers: { authorization: `Bearer ${SUITE_ACTOR}` }, threadId: "proto-http-agent" });
    agent.addMessage({ id: "u1", role: "user", content: "good name for a goldfish" });
    const seen: string[] = [];
    await agent.runAgent({ runId: "proto-http-1" }, { onEvent: ({ event }: { event: { type: string } }) => void seen.push(event.type) });
    expect(seen[0]).toBe("RUN_STARTED");
    expect(seen.at(-1)).toBe("RUN_FINISHED");
    expect(seen).toContain("TEXT_MESSAGE_CONTENT");
    expect(agent.messages?.at(-1)).toMatchObject({ role: "assistant", content: DETERMINISTIC_REPLY });
  });

  test("streamed shared state anchors the stream: RUN_STARTED < STATE_SNAPSHOT < TEXT_MESSAGE_* < RUN_FINISHED (J-K)", async () => {
    const result = await stream(runInput("proto-state-order", "proto-state-order-1", JOURNEY_K_AGENT, "resume the delivery"));
    const types = typesOf(result.events);
    const started = types.indexOf("RUN_STARTED");
    const snapshot = types.indexOf("STATE_SNAPSHOT");
    const textStart = types.indexOf("TEXT_MESSAGE_START");
    const textEnd = types.indexOf("TEXT_MESSAGE_END");
    const finished = types.indexOf("RUN_FINISHED");
    expect(started).toBe(0);
    expect(snapshot).toBeGreaterThan(started);
    expect(textStart).toBeGreaterThan(snapshot);
    expect(textEnd).toBeGreaterThan(textStart);
    expect(finished).toBe(types.length - 1);
    expect(types.slice(textStart + 1, textEnd).every((type) => type === "TEXT_MESSAGE_CONTENT")).toBe(true);
    expect(result.events.find((event) => event.type === "STATE_SNAPSHOT")!.snapshot).toEqual({ phase: "streaming" });
    expect(
      eventsOf(result.events, "TEXT_MESSAGE_CONTENT")
        .map((event) => event.delta)
        .join(""),
    ).toBe(LIVE_RECOVERY_CHUNKS.join(""));
  });

  test("frontend tool HITL: TOOL_CALL_START < ARGS < END < RUN_FINISHED(waiting), resolved by a tool message (J-F)", async () => {
    const prompt = "30-minute meeting to learn about CopilotKit";
    const discovered = await stream(runInput("proto-tool-hitl", "proto-tool-hitl-1", JOURNEY_F_AGENT, prompt));
    const types = typesOf(discovered.events);
    const started = types.indexOf("RUN_STARTED");
    const callStart = types.indexOf("TOOL_CALL_START");
    const callArgs = types.indexOf("TOOL_CALL_ARGS");
    const callEnd = types.indexOf("TOOL_CALL_END");
    const finished = types.indexOf("RUN_FINISHED");
    expect(started).toBe(0);
    expect(callStart).toBeGreaterThan(started);
    expect(callArgs).toBeGreaterThan(callStart);
    expect(callEnd).toBeGreaterThan(callArgs);
    expect(finished).toBe(types.length - 1);

    const startEvent = discovered.events[callStart]!;
    expect(startEvent.toolCallName).toBe("schedule.meeting");
    // Arguments stream as deltas that fold to the complete JSON payload by TOOL_CALL_END.
    expect(typeof JSON.parse(discovered.events[callArgs]!.delta as string)).toBe("object");

    const waiting = discovered.events[finished]!.result as { status: string; continuations: { id: string; type: string; version: number }[] };
    expect(waiting.status).toBe("waiting");
    expect(waiting.continuations).toHaveLength(1);
    expect(waiting.continuations[0]!.type).toBe("frontend:schedule.meeting");
    expect(typeof waiting.continuations[0]!.id).toBe("string");
    expect(typeof waiting.continuations[0]!.version).toBe("number");

    // The client returns the tool result the AG-UI way: a tool message naming the tool call.
    const resolved = await stream({
      ...baseInput,
      threadId: "proto-tool-hitl",
      runId: "proto-tool-hitl-2",
      messages: [{ id: "tool-1", role: "tool", toolCallId: startEvent.toolCallId, content: JSON.stringify({ scheduled: true }) }],
    });
    expectBracketedText(resolved.events, CONTINUATION_MESSAGE);
    expect(typesOf(resolved.events).at(-1)).toBe("RUN_FINISHED");
    expect((resolved.events.at(-1)!.result as { status: string }).status).toBe("completed");
  });

  test("backend-executed frontend capability: the TOOL_CALL arc closes with TOOL_CALL_RESULT after TOOL_CALL_END (J-B)", async () => {
    // A mounted client capability, published exactly as the reconstruction's own client publishes
    // one (same actor the endpoint derives from the suite's Bearer token).
    await app.runtime.service.publishRemoteOffer(suiteCaller, {
      leaseId: crypto.randomUUID(),
      agent: JOURNEY_B_AGENT,
      contract: { id: "browser.selection.apply", version: "1.0.0" },
      description: "Apply the agent-selected value to the mounted browser surface",
      inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
      ttlMs: 30_000,
    });

    const discovered = await stream(runInput("proto-remote-tool", "proto-remote-tool-1", JOURNEY_B_AGENT, "apply the selection"));
    const types = typesOf(discovered.events);
    const callStart = types.indexOf("TOOL_CALL_START");
    const callArgs = types.indexOf("TOOL_CALL_ARGS");
    const callEnd = types.indexOf("TOOL_CALL_END");
    expect(callStart).toBeGreaterThan(0);
    expect(callArgs).toBeGreaterThan(callStart);
    expect(callEnd).toBeGreaterThan(callArgs);
    const startEvent = discovered.events[callStart]!;
    expect(startEvent.toolCallName).toBe("browser.selection.apply");
    expect(JSON.parse(discovered.events[callArgs]!.delta as string)).toEqual({ value: "chosen by the agent" });
    expect((discovered.events.at(-1)!.result as { status: string }).status).toBe("waiting");
    const continuationId = (discovered.events.at(-1)!.result as { continuations: { id: string }[] }).continuations[0]!.id;

    const resolved = await stream({
      ...baseInput,
      threadId: "proto-remote-tool",
      runId: "proto-remote-tool-2",
      forwardedProps: { cognate: { resolve: { continuationId, action: "resume", input: { ok: true, value: { applied: "chosen by the agent" } } } } },
    });
    const resolvedTypes = typesOf(resolved.events);
    const resultEvent = resolved.events.find((event) => event.type === "TOOL_CALL_RESULT")!;
    expect(resultEvent).toBeDefined();
    expect(resultEvent.toolCallId).toBe(startEvent.toolCallId);
    expect(resultEvent.role).toBe("tool");
    expect(JSON.parse(resultEvent.content as string)).toEqual({ applied: "chosen by the agent" });
    // Correct ordering across the interaction: the result follows the END of the same tool call,
    // anchored to the durable positions both were projected from.
    const endPosition = durablePosition(discovered.events[callEnd]!);
    const resultPosition = durablePosition(resultEvent);
    expect(typeof endPosition).toBe("number");
    expect(typeof resultPosition).toBe("number");
    expect(resultPosition!).toBeGreaterThan(endPosition!);
    expect(resolvedTypes.indexOf("TOOL_CALL_RESULT")).toBeLessThan(resolvedTypes.indexOf("RUN_FINISHED"));
    const finished = resolved.events.at(-1)!;
    expect((finished.result as { status: string }).status).toBe("completed");
    expect((finished.result as { output?: { acknowledgment?: unknown } }).output?.acknowledgment).toEqual({ applied: "chosen by the agent" });
  });

  test("a generic AG-UI client completes the remote-offer round trip via the standard tool-message path, no cognate extension (FU-1)", async () => {
    // FU-1 regression: remote-offer waits project a bare wire toolCallId (the continuation id is
    // `<runId>.wait.remote:<remoteId>`); the adapter addresses a bare echoed id to the thread's
    // current run's remote continuation, so a standards-compliant client needs no extension here.
    await app.runtime.service.publishRemoteOffer(suiteCaller, {
      leaseId: crypto.randomUUID(),
      agent: JOURNEY_B_AGENT,
      contract: { id: "browser.selection.apply", version: "1.0.0" },
      description: "Apply the agent-selected value to the mounted browser surface",
      inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
      ttlMs: 30_000,
    });
    const discovered = await stream(runInput("proto-remote-standard", "proto-remote-standard-1", JOURNEY_B_AGENT, "apply the selection"));
    const startEvent = discovered.events.find((event) => event.type === "TOOL_CALL_START" && event.toolCallName === "browser.selection.apply")!;
    expect(startEvent).toBeDefined();
    expect((discovered.events.at(-1)!.result as { status: string }).status).toBe("waiting");

    const resolved = await stream({
      ...baseInput,
      threadId: "proto-remote-standard",
      runId: "proto-remote-standard-2",
      messages: [{ id: "tool-1", role: "tool", toolCallId: startEvent.toolCallId, content: JSON.stringify({ applied: "chosen by the agent" }) }],
    });
    const resultEvent = resolved.events.find((event) => event.type === "TOOL_CALL_RESULT")!;
    expect(resultEvent).toBeDefined();
    expect(resultEvent.toolCallId).toBe(startEvent.toolCallId);
    expect(JSON.parse(resultEvent.content as string)).toEqual({ applied: "chosen by the agent" });
    expect(typesOf(resolved.events).at(-1)).toBe("RUN_FINISHED");
    expect((resolved.events.at(-1)!.result as { status: string }).status).toBe("completed");
    expect((resolved.events.at(-1)!.result as { output?: { acknowledgment?: unknown } }).output?.acknowledgment).toEqual({ applied: "chosen by the agent" });
  });

  test("runtime interrupt: the CUSTOM event carries the J-G interrupt payload, then the run resumes or is cancelled", async () => {
    const reason = "pause the run here";
    const discovered = await stream(runInput("proto-interrupt", "proto-interrupt-1", JOURNEY_G_AGENT, reason));
    const custom = eventsOf(discovered.events, "CUSTOM");
    expect(custom).toHaveLength(1);
    expect(typesOf(discovered.events).indexOf("CUSTOM")).toBeLessThan(typesOf(discovered.events).indexOf("RUN_FINISHED"));
    expect(custom[0]!.name).toBe("cognate.unsupported_interaction");
    expect(custom[0]!.value).toMatchObject({ type: "run-interrupt", kind: "interrupt", payload: { reason } });
    // FU-3: the payload is self-sufficient — a generic client can act via
    // forwardedProps.cognate.resolve/cancel using the carried ids, without parsing rawEvent.
    expect(typeof (custom[0]!.value as { id?: unknown }).id).toBe("string");
    expect(((custom[0]!.value as { id?: string }).id ?? "").length).toBeGreaterThan(0);
    expect(typeof (custom[0]!.value as { runId?: unknown }).runId).toBe("string");
    expect(((custom[0]!.value as { runId?: string }).runId ?? "").length).toBeGreaterThan(0);
    expect((custom[0]!.value as { threadId?: unknown }).threadId).toBe("proto-interrupt");
    const finished = discovered.events.at(-1)!;
    const waiting = finished.result as { status: string; continuations: { id: string; type: string; version: number }[] };
    expect(waiting.status).toBe("waiting_unsupported");
    expect(waiting.continuations).toHaveLength(1);
    expect(waiting.continuations[0]!.type).toBe("run-interrupt");

    const resumed = await stream({
      ...baseInput,
      threadId: "proto-interrupt",
      runId: "proto-interrupt-2",
      forwardedProps: { cognate: { resolve: { continuationId: waiting.continuations[0]!.id, action: "resume", input: { approved: true } } } },
    });
    expect(typesOf(resumed.events)).not.toContain("RUN_ERROR");
    expect(typesOf(resumed.events).at(-1)).toBe("RUN_FINISHED");
    expect((resumed.events.at(-1)!.result as { status: string }).status).toBe("completed");

    // The other settlement of the same interrupt: the human cancels.
    await stream(runInput("proto-interrupt-cancel", "proto-interrupt-cancel-1", JOURNEY_G_AGENT, reason));
    const cancelled = await stream({
      ...baseInput,
      threadId: "proto-interrupt-cancel",
      runId: "proto-interrupt-cancel-2",
      forwardedProps: { cognate: { cancel: { reason: "operator aborted" } } },
    });
    expect(typesOf(cancelled.events)).toEqual(["RUN_ERROR"]);
    expect(cancelled.events[0]).toMatchObject({ message: "operator aborted", code: "cancelled" });
  });

  test("a caller-committed state patch streams as STATE_DELTA after a STATE_SNAPSHOT anchor on reconnect", async () => {
    const threadId = "proto-state-delta";
    const first = await stream(runInput(threadId, "proto-state-delta-1", JOURNEY_K_AGENT, "deliver"));
    const cognateRunId = (first.events.find((event) => event.type === "RUN_STARTED")!.rawEvent as { cognate: { runId: string } }).cognate.runId;

    // Cursor = the durable position of the run's terminal event, read through the runtime the
    // same way the reconstruction application reads it.
    const runEvents = await Array.fromAsync(app.runtime.service.events(suiteCaller, { runId: cognateRunId }));
    const completed = runEvents.find((event) => event.eventType === "run.completed")!;
    expect(completed).toBeDefined();

    // The caller writes thread state (RFC 6902 patch) exactly as the reconstruction's shared-state
    // surface does; the adapter's public threadCorrelationId scopes it to the AG-UI thread.
    const patch = [{ op: "replace", path: "/phase", value: "delivered" }];
    await app.runtime.service.updateSharedState(suiteCaller, {
      threadId: threadCorrelationId(threadId),
      update: { patch },
      idempotencyKey: `agui-protocol:${crypto.randomUUID()}`,
    });

    const reconnected = await stream(
      { ...baseInput, threadId, runId: "proto-state-delta-2", forwardedProps: { cognate: { cursor: completed.position } } },
      { stopWhen: (event) => event.type === "STATE_DELTA" },
    );
    const types = typesOf(reconnected.events);
    expect(types[0]).toBe("STATE_SNAPSHOT");
    // The anchor is the fold at the cursor — the patch is not folded in yet.
    expect(reconnected.events.find((event) => event.type === "STATE_SNAPSHOT")!.snapshot).toEqual({ phase: "streaming" });
    const delta = reconnected.events.find((event) => event.type === "STATE_DELTA")!;
    expect(delta.delta).toEqual(patch);
    expect(types.indexOf("STATE_SNAPSHOT")).toBeLessThan(types.indexOf("STATE_DELTA"));
  });

  test("a malformed RunAgentInput is rejected with a 400 JSON error, never a stream", async () => {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ threadId: "proto-bad" }) });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("invalid RunAgentInput");

    const unparseable = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "not json" });
    expect(unparseable.status).toBe(400);
    const unparseableBody = (await unparseable.json()) as { error?: string };
    expect(unparseableBody.error).toBe("invalid JSON body");
  });
});
