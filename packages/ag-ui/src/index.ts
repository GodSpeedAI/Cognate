import type { StoredEvent } from "@cognate/events";
import type { Caller, RuntimeService } from "@cognate/runtime-api";

/** One row per AG-UI 1.0.0 EventType (all 31): how Cognate produces or handles it (spec §24 compatibility matrix). */
export interface MatrixRow {
  readonly agUiType: string;
  readonly direction: "outbound" | "inbound" | "none";
  readonly supported: boolean;
  /** Framework source (e.g. `run.started`, `message.delta`) or the reason it is unsupported. */
  readonly note: string;
}
export const matrix: readonly MatrixRow[] = [];

/** Framework event types deliberately not projected to AG-UI (explicitly ignored, never reinterpreted). */
export const ignoredFrameworkEvents: readonly string[] = [];

/** AG-UI event as a plain object; `rawEvent.cognate` carries `{ eventId, position }` of the durable source. */
export type AgUiEvent = { readonly type: string; readonly [key: string]: unknown };

/**
 * Stateful per-run projector: feed durable events in order, get schema-valid AG-UI events.
 * Text deltas are bracketed by TEXT_MESSAGE_START/END; invocations become TOOL_CALL_*; state becomes
 * STATE_SNAPSHOT / STATE_DELTA; frontend-capability continuations become client tool calls.
 */
export function createProjector(_options: { readonly threadId: string; readonly runId: string }): { push(event: StoredEvent): readonly AgUiEvent[]; snapshot(): readonly AgUiEvent[] } {
  throw new Error("ag-ui: not implemented");
}

export interface EndpointOptions {
  readonly service: RuntimeService;
  readonly authenticate: (headers: Headers) => Caller | undefined | Promise<Caller | undefined>;
  /** Agent to start for new user messages when `forwardedProps.cognate.agent` is absent. */
  readonly defaultAgent: string;
}

/**
 * HTTP endpoint for AG-UI clients: POST RunAgentInput → SSE stream of AG-UI events. Inbound actions (user message,
 * tool results for frontend capabilities, continuation responses, cancellation) go through RuntimeService with the
 * authenticated caller. `forwardedProps.cognate.cursor` resumes from a durable position; an invalid cursor yields
 * a full resync. Disconnecting never cancels the durable run.
 */
export function createAgUiHandler(_options: EndpointOptions): (request: Request) => Promise<Response> {
  throw new Error("ag-ui: not implemented");
}
