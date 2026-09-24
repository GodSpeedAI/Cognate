// CG-AGUI (spec §24, §31.8, §32; ADR-0008): AG-UI 1.0.0 interoperability adapter.
// Outbound: durable Cognate events -> schema-valid AG-UI events (never the reverse: AG-UI never becomes
// the internal event model). Inbound: AG-UI actions pass through RuntimeService with the transport's
// authenticated caller, never trusting the wire body for identity (spec §32).
import { EventType } from "@ag-ui/core";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import { EventEncoder } from "@ag-ui/encoder";
import type { Json, StoredEvent } from "@cognate/events";
import { FRONTEND_CAPABILITY } from "@cognate/runtime-api";
import type { Caller, ContinuationView, RuntimeService } from "@cognate/runtime-api";
import { ServiceError } from "@cognate/runtime-api";

/** One row per AG-UI 1.0.0 EventType (all 31): how Cognate produces or handles it (spec §24 compatibility matrix). */
export interface MatrixRow {
  readonly agUiType: string;
  readonly direction: "outbound" | "inbound" | "none";
  readonly supported: boolean;
  /** Framework source (e.g. `run.started`, `message.delta`) or the reason it is unsupported. */
  readonly note: string;
}

const row = (agUiType: string, direction: MatrixRow["direction"], supported: boolean, note: string): MatrixRow => ({ agUiType, direction, supported, note });

export const matrix: readonly MatrixRow[] = [
  row(EventType.RUN_STARTED, "outbound", true, "run.started"),
  row(EventType.RUN_FINISHED, "outbound", true, "run.completed, or run.waiting once the run stabilizes (result.status: completed | waiting | waiting_unsupported)"),
  row(EventType.RUN_ERROR, "outbound", true, "run.failed, run.cancelled (code: cancelled), or a ServiceError from an inbound action (code: the ServiceErrorCode)"),
  row(EventType.TEXT_MESSAGE_START, "outbound", true, "message.delta (opens a streamed assistant message; emitted once per open message)"),
  row(EventType.TEXT_MESSAGE_CONTENT, "outbound", true, "message.delta"),
  row(EventType.TEXT_MESSAGE_END, "outbound", true, "message.delta (closed before any non-delta projection)"),
  row(EventType.TEXT_MESSAGE_CHUNK, "none", false, "Cognate always emits explicit start/content/end; the chunk shorthand is unused"),
  row(EventType.TOOL_CALL_START, "outbound", true, "run.invocation (kernel capability), or a frontend_capability continuation (toolCallId = continuation id)"),
  row(EventType.TOOL_CALL_ARGS, "outbound", true, "run.invocation payload.input (kernel invocations; '{}' after erasure) or the continuation payload (frontend capabilities)"),
  row(EventType.TOOL_CALL_END, "outbound", true, "run.invocation / frontend_capability continuation"),
  row(EventType.TOOL_CALL_CHUNK, "none", false, "the chunk shorthand is unused"),
  row(EventType.TOOL_CALL_RESULT, "outbound", true, "run.invocation result or failure, JSON-stringified"),
  row(EventType.STATE_SNAPSHOT, "outbound", true, "state.changed{snapshot}, or a folded snapshot synthesized on reconnect/resync"),
  row(EventType.STATE_DELTA, "outbound", true, "state.changed{patch} (RFC 6902 patch passed through verbatim)"),
  row(EventType.MESSAGES_SNAPSHOT, "outbound", true, "synthesized on a full resync (unknown/expired cursor) from folded message.delta history"),
  row(EventType.ACTIVITY_SNAPSHOT, "none", false, "Cognate has no activity-log concept distinct from state and messages"),
  row(EventType.ACTIVITY_DELTA, "none", false, "Cognate has no activity-log concept distinct from state and messages"),
  row(EventType.RAW, "none", false, "the adapter does not pass through foreign wire events verbatim"),
  row(EventType.CUSTOM, "outbound", true, "human continuations (cognate.continuation), artifacts (cognate.artifact), and continuation kinds with no faithful AG-UI representation (cognate.unsupported_interaction)"),
  row(EventType.STEP_STARTED, "none", false, "ctx.step is internal replay-determinism bookkeeping (run.step.completed), not a user-facing span"),
  row(EventType.STEP_FINISHED, "none", false, "ctx.step is internal replay-determinism bookkeeping, not a user-facing span"),
  row(EventType.REASONING_START, "none", false, "Cognate has no reasoning/thinking channel distinct from message.delta"),
  row(EventType.REASONING_MESSAGE_START, "none", false, "Cognate has no reasoning/thinking channel distinct from message.delta"),
  row(EventType.REASONING_MESSAGE_CONTENT, "none", false, "Cognate has no reasoning/thinking channel distinct from message.delta"),
  row(EventType.REASONING_MESSAGE_END, "none", false, "Cognate has no reasoning/thinking channel distinct from message.delta"),
  row(EventType.REASONING_MESSAGE_CHUNK, "none", false, "Cognate has no reasoning/thinking channel distinct from message.delta"),
  row(EventType.REASONING_END, "none", false, "Cognate has no reasoning/thinking channel distinct from message.delta"),
  row(EventType.REASONING_ENCRYPTED_VALUE, "none", false, "Cognate has no reasoning/thinking channel distinct from message.delta"),
  row(EventType.SUBAGENT_STARTED, "none", false, "Cognate runs are flat; no nested subagent invocation is surfaced yet"),
  row(EventType.SUBAGENT_FINISHED, "none", false, "Cognate runs are flat; no nested subagent invocation is surfaced yet"),
  row(EventType.SUBAGENT_ERROR, "none", false, "Cognate runs are flat; no nested subagent invocation is surfaced yet"),
];

/** Framework event types deliberately not projected to AG-UI (explicitly ignored, never reinterpreted). */
export const ignoredFrameworkEvents: readonly string[] = [
  "run.step.completed",
  "run.resumed",
  "run.wait.closed",
  "run.recall",
];

/** AG-UI event as a plain object; `rawEvent.cognate` carries `{ eventId, position, runId }` of the durable source. */
export type AgUiEvent = { readonly type: string; readonly [key: string]: unknown };

const SUPPORTED_CONTINUATION_KINDS = new Set<string>(["human_approval", FRONTEND_CAPABILITY]);

function conditionKindOf(view: ContinuationView | undefined): string | undefined {
  const c = view?.condition;
  if (c && typeof c === "object" && !Array.isArray(c) && typeof (c as { kind?: unknown }).kind === "string") return (c as { kind: string }).kind;
  return undefined;
}

function payloadField<T>(event: StoredEvent, key: string): T | undefined {
  const p = event.payload;
  return p && typeof p === "object" && !Array.isArray(p) && key in p ? ((p as { [k: string]: Json })[key] as unknown as T) : undefined;
}

function metaField<T>(event: StoredEvent, key: string): T | undefined {
  const m = event.metadata;
  return m && key in m ? ((m as { [k: string]: Json })[key] as unknown as T) : undefined;
}

// ── JSON Patch (RFC 6902), minimal subset needed to fold state.changed history into a snapshot ─────────

type PatchOp = { readonly op: string; readonly path: string; readonly value?: Json; readonly from?: string };

function pointer(path: string): readonly string[] {
  if (path === "") return [];
  return path
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function clone(v: Json): Json {
  return v === null ? null : (JSON.parse(JSON.stringify(v)) as Json);
}

function setAt(doc: Json, path: readonly string[], value: Json, mode: "add" | "replace" | "remove"): Json {
  if (path.length === 0) return mode === "remove" ? null : value;
  const result = clone(doc ?? {});
  let cursor: Json = result;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]!;
    if (Array.isArray(cursor)) cursor = cursor[seg === "-" ? cursor.length - 1 : Number(seg)]!;
    else if (cursor && typeof cursor === "object") cursor = (cursor as { [k: string]: Json })[seg]!;
  }
  const last = path[path.length - 1]!;
  if (Array.isArray(cursor)) {
    const index = last === "-" ? cursor.length : Number(last);
    if (mode === "remove") cursor.splice(index, 1);
    else if (mode === "add") cursor.splice(index, 0, value);
    else cursor[index] = value;
  } else if (cursor && typeof cursor === "object") {
    const record = cursor as { [k: string]: Json };
    if (mode === "remove") delete record[last];
    else record[last] = value;
  }
  return result;
}

function applyPatch(doc: Json, ops: readonly PatchOp[]): Json {
  let result = doc;
  for (const op of ops) {
    if (op.op === "add") result = setAt(result, pointer(op.path), op.value ?? null, "add");
    else if (op.op === "replace") result = setAt(result, pointer(op.path), op.value ?? null, "replace");
    else if (op.op === "remove") result = setAt(result, pointer(op.path), null, "remove");
    else if (op.op === "move" && op.from) {
      result = setAt(result, pointer(op.path), null, "remove");
    }
  }
  return result;
}

/**
 * Stateful per-run projector: feed durable events in order, get schema-valid AG-UI events.
 * Text deltas are bracketed by TEXT_MESSAGE_START/END; invocations become TOOL_CALL_*; state becomes
 * STATE_SNAPSHOT / STATE_DELTA; frontend-capability continuations become client tool calls.
 */
export function createProjector(options: { readonly threadId: string; readonly runId: string; readonly continuation?: (id: string) => ContinuationView | undefined }): {
  push(event: StoredEvent): readonly AgUiEvent[];
  /** Yields MESSAGES_SNAPSHOT + STATE_SNAPSHOT from everything folded via `push` so far. */
  snapshot(): readonly AgUiEvent[];
  /** Yields only STATE_SNAPSHOT from the current fold (used to anchor a cursor-resumed stream). */
  stateOnly(): readonly AgUiEvent[];
} {
  let openMessageId: string | undefined;
  let text = "";
  let state: Json = null;

  const cognateOf = (e: StoredEvent) => ({ eventId: e.eventId, position: e.position, runId: e.runId });

  function closeText(out: AgUiEvent[], cognate: unknown): void {
    if (openMessageId) {
      out.push({ type: "TEXT_MESSAGE_END", messageId: openMessageId, rawEvent: { cognate } });
      openMessageId = undefined;
    }
  }

  function updateFold(event: StoredEvent): void {
    if (event.eventType === "message.delta") {
      const t = payloadField<string>(event, "text");
      if (typeof t === "string") text += t;
    } else if (event.eventType === "state.changed") {
      const snapshot = payloadField<Json>(event, "snapshot");
      if (snapshot !== undefined) state = snapshot;
      else {
        const patch = payloadField<readonly PatchOp[]>(event, "patch");
        if (patch) state = applyPatch(state, patch);
      }
    }
  }

  function project(event: StoredEvent): AgUiEvent[] {
    const out: AgUiEvent[] = [];
    const cognate = cognateOf(event);
    switch (event.eventType) {
      case "run.started":
        out.push({ type: "RUN_STARTED", threadId: options.threadId, runId: options.runId, rawEvent: { cognate } });
        break;
      case "message.delta": {
        const t = payloadField<string>(event, "text");
        if (typeof t !== "string") break;
        if (!openMessageId) {
          openMessageId = event.eventId;
          out.push({ type: "TEXT_MESSAGE_START", messageId: openMessageId, role: "assistant", rawEvent: { cognate } });
        }
        out.push({ type: "TEXT_MESSAGE_CONTENT", messageId: openMessageId, delta: t, rawEvent: { cognate } });
        break;
      }
      case "state.changed": {
        closeText(out, cognate);
        const snapshot = payloadField<Json>(event, "snapshot");
        if (snapshot !== undefined) out.push({ type: "STATE_SNAPSHOT", snapshot, rawEvent: { cognate } });
        else {
          const patch = payloadField<readonly PatchOp[]>(event, "patch");
          if (patch) out.push({ type: "STATE_DELTA", delta: patch, rawEvent: { cognate } });
        }
        break;
      }
      case "run.artifact": {
        // AG-UI 1.0.0 has no artifact event; project explicitly as CUSTOM rather than dropping it.
        closeText(out, cognate);
        out.push({ type: "CUSTOM", name: "cognate.artifact", value: { artifactId: metaField<string>(event, "artifactId") ?? payloadField<string>(event, "artifactId") ?? null }, rawEvent: { cognate } });
        break;
      }
      case "run.invocation": {
        closeText(out, cognate);
        const stepId = metaField<string>(event, "stepId") ?? event.eventId;
        const capability = metaField<string>(event, "capability") ?? "capability";
        const ok = metaField<boolean>(event, "ok") === true;
        out.push({ type: "TOOL_CALL_START", toolCallId: stepId, toolCallName: capability, rawEvent: { cognate } });
        out.push({ type: "TOOL_CALL_ARGS", toolCallId: stepId, delta: JSON.stringify(payloadField<Json>(event, "input") ?? {}), rawEvent: { cognate } });
        out.push({ type: "TOOL_CALL_END", toolCallId: stepId, rawEvent: { cognate } });
        const content = JSON.stringify(ok ? (payloadField<Json>(event, "result") ?? null) : (payloadField<Json>(event, "failure") ?? null));
        out.push({ type: "TOOL_CALL_RESULT", messageId: `${stepId}:result`, toolCallId: stepId, content, role: "tool", rawEvent: { cognate } });
        break;
      }
      case "run.waiting": {
        closeText(out, cognate);
        const continuationId = metaField<string>(event, "continuationId") ?? "";
        const waitType = payloadField<string>(event, "type") ?? "";
        const view = options.continuation?.(continuationId);
        if (waitType.startsWith("frontend:")) {
          const capability = waitType.slice("frontend:".length);
          out.push({ type: "TOOL_CALL_START", toolCallId: continuationId, toolCallName: capability, rawEvent: { cognate } });
          out.push({ type: "TOOL_CALL_ARGS", toolCallId: continuationId, delta: JSON.stringify(view?.payload ?? {}), rawEvent: { cognate } });
          out.push({ type: "TOOL_CALL_END", toolCallId: continuationId, rawEvent: { cognate } });
        } else {
          const kind = conditionKindOf(view);
          const supported = kind !== undefined && SUPPORTED_CONTINUATION_KINDS.has(kind);
          out.push({
            type: "CUSTOM",
            name: supported ? "cognate.continuation" : "cognate.unsupported_interaction",
            value: { id: continuationId, type: waitType, kind: kind ?? "unknown", payload: view?.payload ?? null },
            rawEvent: { cognate },
          });
        }
        break;
      }
      case "run.completed": {
        closeText(out, cognate);
        out.push({ type: "RUN_FINISHED", threadId: options.threadId, runId: options.runId, result: { status: "completed", output: payloadField<Json>(event, "output") ?? null }, rawEvent: { cognate } });
        break;
      }
      case "run.failed": {
        closeText(out, cognate);
        out.push({ type: "RUN_ERROR", message: payloadField<string>(event, "error") ?? "run failed", code: "failed", rawEvent: { cognate } });
        break;
      }
      case "run.cancelled": {
        closeText(out, cognate);
        out.push({ type: "RUN_ERROR", message: payloadField<string>(event, "reason") ?? "cancelled", code: "cancelled", rawEvent: { cognate } });
        break;
      }
      default:
        break; // ignoredFrameworkEvents and anything unrecognized project to nothing
    }
    return out;
  }

  return {
    push(event: StoredEvent): readonly AgUiEvent[] {
      updateFold(event);
      return project(event);
    },
    snapshot(): readonly AgUiEvent[] {
      const messages = text ? [{ id: `${options.runId}:assistant`, role: "assistant", content: text }] : [];
      return [
        { type: "MESSAGES_SNAPSHOT", messages },
        { type: "STATE_SNAPSHOT", snapshot: state },
      ];
    },
    stateOnly(): readonly AgUiEvent[] {
      return [{ type: "STATE_SNAPSHOT", snapshot: state }];
    },
  };
}

export interface EndpointOptions {
  readonly service: RuntimeService;
  readonly authenticate: (headers: Headers) => Caller | undefined | Promise<Caller | undefined>;
  /** Agent to start for new user messages when `forwardedProps.cognate.agent` is absent. */
  readonly defaultAgent: string;
}

type Message = { readonly id: string; readonly role: string; readonly content?: unknown; readonly toolCallId?: string };
type RunAgentInput = { readonly threadId: string; readonly runId: string; readonly messages: readonly Message[]; readonly forwardedProps?: Record<string, unknown> };
type CognateProps = { readonly agent?: string; readonly cancel?: { readonly reason?: string }; readonly resolve?: { readonly continuationId: string; readonly action: "resume" | "cancel"; readonly input?: Json; readonly expectedVersion?: number }; readonly cursor?: number };

function cognateProps(input: RunAgentInput): CognateProps {
  const raw = (input.forwardedProps as { cognate?: CognateProps } | undefined)?.cognate;
  return raw ?? {};
}

const encoder = new EventEncoder();

function sseResponse(events: readonly AgUiEvent[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder();
      for (const event of events) {
        try {
          controller.enqueue(bytes.encode(encoder.encodeSSE(event as never)));
        } catch {
          break;
        }
      }
      try {
        controller.close();
      } catch {
        // already closed by a disconnect
      }
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": encoder.getContentType() } });
}

/**
 * HTTP endpoint for AG-UI clients: POST RunAgentInput → SSE stream of AG-UI events. Inbound actions (user message,
 * tool results for frontend capabilities, continuation responses, cancellation) go through RuntimeService with the
 * authenticated caller. `forwardedProps.cognate.cursor` resumes from a durable position; an invalid cursor yields
 * a full resync. Disconnecting never cancels the durable run.
 */
export function createAgUiHandler(options: EndpointOptions): (request: Request) => Promise<Response> {
  const { service } = options;
  // Thread -> current Cognate run mapping. AG-UI threadId/runId are client-chosen; Cognate mints its own
  // runId in startRun (idempotent per `agui:<threadId>:<runId>`), so the adapter tracks the mapping here
  // in-process, keyed by tenant+threadId, to route later actions (resolve/cancel/reconnect) to the right run.
  const runByThread = new Map<string, string>();

  return async function handle(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    const parsed = RunAgentInputSchema.safeParse(body);
    if (!parsed.success) return new Response(JSON.stringify({ error: "invalid RunAgentInput", issues: parsed.error.issues }), { status: 400, headers: { "content-type": "application/json" } });
    const input = parsed.data as unknown as RunAgentInput;

    const caller = await options.authenticate(request.headers);
    if (!caller) return new Response(null, { status: 401 });

    const key = `${caller.tenant}:${input.threadId}`;
    const props = cognateProps(input);

    const resolveRunId = async (): Promise<string> => {
      const existing = runByThread.get(key);
      if (existing) return existing;
      throw new ServiceError("not_found", `no Cognate run is known for thread ${input.threadId}`);
    };

    let cognateRunId: string;
    let mode: "full" | "reconnect";
    try {
      if (props.cancel) {
        cognateRunId = await resolveRunId();
        await service.cancelRun(caller, { runId: cognateRunId, reason: props.cancel.reason ?? "cancelled", idempotencyKey: `agui:${input.threadId}:${input.runId}:cancel` });
        mode = "full";
      } else if (props.resolve) {
        await service.resolveContinuation(caller, {
          continuationId: props.resolve.continuationId,
          action: props.resolve.action,
          input: props.resolve.input ?? null,
          idempotencyKey: `agui:resolve:${props.resolve.continuationId}:${props.resolve.action}`,
          ...(props.resolve.expectedVersion !== undefined ? { expectedVersion: props.resolve.expectedVersion } : {}),
        });
        cognateRunId = await resolveRunId();
        mode = "full";
      } else if (input.messages.some((m) => m.role === "tool")) {
        const toolMessage = [...input.messages].reverse().find((m) => m.role === "tool")!;
        let value: Json;
        try {
          value = JSON.parse(String(toolMessage.content ?? "null"));
        } catch {
          value = String(toolMessage.content ?? "");
        }
        await service.resolveContinuation(caller, { continuationId: toolMessage.toolCallId!, action: "resume", input: { ok: true, value }, idempotencyKey: `agui:resolve:${toolMessage.toolCallId}:tool` });
        cognateRunId = await resolveRunId();
        mode = "full";
      } else if (input.messages.some((m) => m.role === "user")) {
        const userMessage = [...input.messages].reverse().find((m) => m.role === "user")!;
        const text = typeof userMessage.content === "string" ? userMessage.content : "";
        const view = await service.startRun(caller, { agent: props.agent ?? options.defaultAgent, input: { message: text }, idempotencyKey: `agui:${input.threadId}:${input.runId}` });
        runByThread.set(key, view.runId);
        cognateRunId = view.runId;
        mode = "full";
      } else {
        cognateRunId = await resolveRunId();
        mode = "reconnect";
      }
    } catch (error) {
      if (error instanceof ServiceError) return sseResponse([{ type: "RUN_ERROR", message: error.message, code: error.code }]);
      throw error;
    }

    // Wait for the run to settle (terminal, or waiting with nothing further pending) before reading its
    // history: the runtime processes a kicked run asynchronously (a status read right after an action may
    // still show the run's *previous* resting state), so the adapter waits for the event count and status
    // to both hold steady across two reads rather than racing the background executor.
    const readHistory = async (): Promise<StoredEvent[]> => {
      const events: StoredEvent[] = [];
      for await (const event of service.events(caller, { runId: cognateRunId, afterPosition: 0 })) events.push(event);
      return events;
    };
    let view = await service.getRun(caller, { runId: cognateRunId });
    let history = await readHistory();
    for (let i = 0, stable = 0; i < 3000 && stable < 2; i++) {
      await Bun.sleep(3);
      const nextView = await service.getRun(caller, { runId: cognateRunId });
      const nextHistory = await readHistory();
      stable = nextView.status !== "running" && nextHistory.length === history.length ? stable + 1 : 0;
      view = nextView;
      history = nextHistory;
    }

    const continuationViews = await service.listContinuations(caller, { runId: cognateRunId });
    const byId = new Map(continuationViews.map((v) => [v.id, v] as const));
    const projector = createProjector({ threadId: input.threadId, runId: input.runId, continuation: (id) => byId.get(id) });

    const out: AgUiEvent[] = [];
    if (mode === "reconnect") {
      const cursor = props.cursor;
      const maxPosition = history.at(-1)?.position ?? 0;
      const validCursor = typeof cursor === "number" && cursor >= 0 && cursor <= maxPosition;
      if (validCursor) {
        for (const event of history) if (event.position <= cursor) projector.push(event);
        out.push(...projector.stateOnly());
        for (const event of history) if (event.position > cursor) out.push(...projector.push(event));
      } else {
        const started = history[0];
        out.push({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId, rawEvent: started ? { cognate: { eventId: started.eventId, position: started.position, runId: started.runId } } : undefined });
        for (const event of history) if (event.eventType === "message.delta" || event.eventType === "state.changed") projector.push(event);
        out.push(...projector.snapshot());
        for (const event of history) {
          if (event.eventType === "run.started" || event.eventType === "message.delta" || event.eventType === "state.changed") continue;
          out.push(...projector.push(event));
        }
      }
    } else {
      for (const event of history) out.push(...projector.push(event));
    }

    if (view.status === "waiting") {
      const open = continuationViews.filter((v) => v.status === "OPEN");
      const supported = open.every((v) => {
        const kind = conditionKindOf(v);
        return kind !== undefined && SUPPORTED_CONTINUATION_KINDS.has(kind);
      });
      out.push({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, result: { status: supported ? "waiting" : "waiting_unsupported", continuations: open.map((v) => ({ id: v.id, type: v.type, version: v.version })) } });
    }

    return sseResponse(out);
  };
}
