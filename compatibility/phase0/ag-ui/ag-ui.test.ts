import { describe, expect, test } from "bun:test";
import { EventType } from "@ag-ui/core";
import {
  EventSchema,
  RunAgentInputSchema,
  RunStartedEventSchema,
  RunFinishedEventSchema,
  RunErrorEventSchema,
  TextMessageStartEventSchema,
  TextMessageContentEventSchema,
  TextMessageEndEventSchema,
  ToolCallStartEventSchema,
  ToolCallArgsEventSchema,
  ToolCallEndEventSchema,
  ToolCallResultEventSchema,
  StateSnapshotEventSchema,
  StateDeltaEventSchema,
  MessagesSnapshotEventSchema,
  CustomEventSchema,
} from "@ag-ui/core/schemas";
import { EventEncoder } from "@ag-ui/encoder";
import { encode as protoEncode, decode as protoDecode } from "@ag-ui/proto";

// --- 1. Package loads under Bun, EventType enumerated ------------------

test("@ag-ui/core loads under Bun and exposes every EventType value", () => {
  const values = Object.values(EventType).sort();
  expect(values).toEqual(
    [
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "TEXT_MESSAGE_CHUNK",
      "TOOL_CALL_START",
      "TOOL_CALL_ARGS",
      "TOOL_CALL_END",
      "TOOL_CALL_CHUNK",
      "TOOL_CALL_RESULT",
      "STATE_SNAPSHOT",
      "STATE_DELTA",
      "MESSAGES_SNAPSHOT",
      "ACTIVITY_SNAPSHOT",
      "ACTIVITY_DELTA",
      "RAW",
      "CUSTOM",
      "RUN_STARTED",
      "RUN_FINISHED",
      "RUN_ERROR",
      "STEP_STARTED",
      "STEP_FINISHED",
      "REASONING_START",
      "REASONING_MESSAGE_START",
      "REASONING_MESSAGE_CONTENT",
      "REASONING_MESSAGE_END",
      "REASONING_MESSAGE_CHUNK",
      "REASONING_END",
      "REASONING_ENCRYPTED_VALUE",
      "SUBAGENT_STARTED",
      "SUBAGENT_FINISHED",
      "SUBAGENT_ERROR",
    ].sort(),
  );
  // observed: @ag-ui/core@1.0.0 ships 31 event types, well beyond the 14
  // named in the task (Reasoning*, Subagent*, Activity*, TEXT/TOOL *_CHUNK,
  // and STEP_* did not exist in the 0.0.x line this task's list references).
  expect(values.length).toBe(31);
});

// --- 2. Well-formed events validate under each schema -------------------

describe("well-formed events validate", () => {
  test("RUN_STARTED", () => {
    const event = { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" };
    expect(RunStartedEventSchema.parse(event)).toMatchObject(event);
    expect(EventSchema.parse(event)).toMatchObject(event);
  });

  test("RUN_FINISHED", () => {
    const event = {
      type: EventType.RUN_FINISHED,
      threadId: "t1",
      runId: "r1",
      outcome: { type: "success" },
    };
    expect(RunFinishedEventSchema.parse(event)).toMatchObject(event);
    expect(EventSchema.parse(event)).toMatchObject(event);
  });

  test("RUN_ERROR", () => {
    const event = { type: EventType.RUN_ERROR, message: "boom", code: "E_BOOM" };
    expect(RunErrorEventSchema.parse(event)).toMatchObject(event);
    expect(EventSchema.parse(event)).toMatchObject(event);
  });

  test("TEXT_MESSAGE_START / CONTENT / END", () => {
    const start = { type: EventType.TEXT_MESSAGE_START, messageId: "m1", role: "assistant" as const };
    const content = { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "hello" };
    const end = { type: EventType.TEXT_MESSAGE_END, messageId: "m1" };
    expect(TextMessageStartEventSchema.parse(start)).toMatchObject(start);
    expect(TextMessageContentEventSchema.parse(content)).toMatchObject(content);
    expect(TextMessageEndEventSchema.parse(end)).toMatchObject(end);
    for (const e of [start, content, end]) expect(EventSchema.parse(e)).toMatchObject(e);
  });

  test("TOOL_CALL_START / ARGS / END / RESULT", () => {
    const start = { type: EventType.TOOL_CALL_START, toolCallId: "tc1", toolCallName: "search" };
    const args = { type: EventType.TOOL_CALL_ARGS, toolCallId: "tc1", delta: '{"q":"cognate"}' };
    const end = { type: EventType.TOOL_CALL_END, toolCallId: "tc1" };
    const result = {
      type: EventType.TOOL_CALL_RESULT,
      messageId: "m2",
      toolCallId: "tc1",
      content: "42 results",
    };
    expect(ToolCallStartEventSchema.parse(start)).toMatchObject(start);
    expect(ToolCallArgsEventSchema.parse(args)).toMatchObject(args);
    expect(ToolCallEndEventSchema.parse(end)).toMatchObject(end);
    expect(ToolCallResultEventSchema.parse(result)).toMatchObject(result);
    for (const e of [start, args, end, result]) expect(EventSchema.parse(e)).toMatchObject(e);
  });

  test("STATE_SNAPSHOT", () => {
    const event = { type: EventType.STATE_SNAPSHOT, snapshot: { count: 1, nested: { ok: true } } };
    expect(StateSnapshotEventSchema.parse(event)).toMatchObject(event);
    expect(EventSchema.parse(event)).toMatchObject(event);
  });

  test("STATE_DELTA (JSON Patch, RFC 6902)", () => {
    const event = {
      type: EventType.STATE_DELTA,
      delta: [
        { op: "add", path: "/count", value: 1 },
        { op: "replace", path: "/count", value: 2 },
        { op: "remove", path: "/scratch" },
        { op: "move", from: "/a", path: "/b" },
        { op: "copy", from: "/b", path: "/c" },
        { op: "test", path: "/count", value: 2 },
      ],
    };
    expect(StateDeltaEventSchema.parse(event)).toMatchObject(event);
    expect(EventSchema.parse(event)).toMatchObject(event);
  });

  test("MESSAGES_SNAPSHOT", () => {
    const event = {
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [
        { id: "m1", role: "user", content: "hi" },
        { id: "m2", role: "assistant", content: "hello back" },
      ],
    };
    expect(MessagesSnapshotEventSchema.parse(event)).toMatchObject(event);
    expect(EventSchema.parse(event)).toMatchObject(event);
  });

  test("CUSTOM", () => {
    const event = { type: EventType.CUSTOM, name: "cognate.debug", value: { anything: "goes" } };
    expect(CustomEventSchema.parse(event)).toMatchObject(event);
    expect(EventSchema.parse(event)).toMatchObject(event);
  });
});

// --- 3. Malformed events are rejected -----------------------------------

describe("malformed events are rejected", () => {
  test("RUN_STARTED missing runId", () => {
    expect(() => RunStartedEventSchema.parse({ type: EventType.RUN_STARTED, threadId: "t1" })).toThrow();
    expect(() => EventSchema.parse({ type: EventType.RUN_STARTED, threadId: "t1" })).toThrow();
  });

  test("TEXT_MESSAGE_CONTENT missing delta", () => {
    expect(() => TextMessageContentEventSchema.parse({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1" })).toThrow();
  });

  test("TOOL_CALL_START missing toolCallName", () => {
    expect(() => ToolCallStartEventSchema.parse({ type: EventType.TOOL_CALL_START, toolCallId: "tc1" })).toThrow();
  });

  test("STATE_DELTA rejects an unknown JSON Patch op", () => {
    expect(() =>
      StateDeltaEventSchema.parse({ type: EventType.STATE_DELTA, delta: [{ op: "bogus", path: "/x" }] }),
    ).toThrow();
  });

  test("CUSTOM missing name", () => {
    expect(() => CustomEventSchema.parse({ type: EventType.CUSTOM, value: 1 })).toThrow();
  });

  test("unknown discriminator type is rejected by the closed union", () => {
    expect(() => EventSchema.parse({ type: "NOT_A_REAL_EVENT" })).toThrow();
  });
});

// --- RunAgentInput shape --------------------------------------------------

test("RunAgentInputSchema validates the run input envelope", () => {
  const input = {
    threadId: "t1",
    runId: "r1",
    state: { count: 0 },
    messages: [{ id: "m1", role: "user", content: "hi" }],
    tools: [],
    context: [],
    forwardedProps: {},
  };
  const parsed = RunAgentInputSchema.parse(input);
  expect(parsed.threadId).toBe("t1");
  expect(parsed.runId).toBe("r1");
});

test("RunAgentInputSchema rejects a missing threadId", () => {
  expect(() => RunAgentInputSchema.parse({ runId: "r1", messages: [] })).toThrow();
});

// --- 4. Encoder / proto packages exist and SSE encoding works under Bun --

test("@ag-ui/encoder exists and encodeSSE round-trips a well-formed event", () => {
  const encoder = new EventEncoder();
  const event = { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" } as const;
  const sse = encoder.encodeSSE(event as any);
  expect(sse.startsWith("data: ")).toBe(true);
  expect(sse.endsWith("\n\n")).toBe(true);
  const payload = JSON.parse(sse.slice("data: ".length).trim());
  expect(payload).toMatchObject(event);
  expect(encoder.getContentType()).toContain("text/event-stream");
});

test("@ag-ui/proto exists and encode/decode round-trips under Bun", () => {
  const event = { type: EventType.RUN_STARTED, threadId: "t1", runId: "r1" } as const;
  const bytes = protoEncode(event as any);
  expect(bytes).toBeInstanceOf(Uint8Array);
  const decoded = protoDecode(bytes);
  expect(decoded).toMatchObject(event);
});
