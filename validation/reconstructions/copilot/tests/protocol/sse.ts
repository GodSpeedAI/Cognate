// Minimal AG-UI SSE participant client: POST one RunAgentInput, read the text/event-stream
// frames, and validate EVERY received frame against the pinned @ag-ui/core EventSchema
// (prompt Phase 10: "Use the exact pinned protocol shapes"). This is deliberately nothing but
// fetch + the protocol schemas — no CopilotKit, no @ag-ui/client — because that is exactly what
// any standards-compliant AG-UI participant must be able to do to interoperate with Cognate.
import { type AgUiEvent, EventSchema } from "./agui-modules.ts";

export interface SchemaFailure {
  readonly frame: number;
  readonly data?: string;
  readonly issues: readonly unknown[];
}

export interface StreamResult {
  readonly status: number;
  readonly contentType: string;
  readonly events: readonly AgUiEvent[];
  readonly schemaFailures: readonly SchemaFailure[];
}

export interface StreamOptions {
  /** Abort the stream as soon as a received event satisfies this predicate. */
  readonly stopWhen?: (event: AgUiEvent) => boolean;
  /** Wall-clock guard so a hung stream fails the test instead of hanging it. */
  readonly deadlineMs?: number;
}

/** Actor the reconstruction server derives from this suite's Bearer token. */
export const SUITE_ACTOR = "protocol-suite";

/** Caller matching the endpoint's `Bearer <actor>` authentication, for RuntimeService calls. */
export const suiteCaller = { actor: { id: SUITE_ACTOR, kind: "user" as const }, tenant: "tenant-a" };

export async function postRunAgentInput(endpoint: string, input: Record<string, unknown>, options: StreamOptions = {}): Promise<StreamResult> {
  const controller = new AbortController();
  let stoppedByPredicate = false;
  const deadline = setTimeout(() => controller.abort(), options.deadlineMs ?? 15_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", accept: "text/event-stream", authorization: `Bearer ${SUITE_ACTOR}` },
      body: JSON.stringify(input),
    });
    const events: AgUiEvent[] = [];
    const schemaFailures: SchemaFailure[] = [];
    if (!response.body) return { status: response.status, contentType: response.headers.get("content-type") ?? "", events, schemaFailures };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let frame = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let separator: number;
        while ((separator = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          const data = chunk.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
          if (!data) continue;
          frame += 1;
          let event: AgUiEvent;
          try {
            event = JSON.parse(data) as AgUiEvent;
          } catch {
            schemaFailures.push({ frame, data, issues: ["frame is not JSON"] });
            continue;
          }
          const parsed = EventSchema.safeParse(event);
          if (!parsed.success) schemaFailures.push({ frame, data, issues: parsed.error?.issues ?? [] });
          events.push(event);
          if (options.stopWhen?.(event)) {
            stoppedByPredicate = true;
            controller.abort();
            return { status: response.status, contentType: response.headers.get("content-type") ?? "", events, schemaFailures };
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      if (!stoppedByPredicate) throw new Error(`AG-UI stream deadline exceeded after ${events.length} frames: ${String(error)}`);
    }
    return { status: response.status, contentType: response.headers.get("content-type") ?? "", events, schemaFailures };
  } finally {
    clearTimeout(deadline);
  }
}

export const typesOf = (events: readonly AgUiEvent[]): string[] => events.map((event) => event.type);

export const eventsOf = (events: readonly AgUiEvent[], type: string): AgUiEvent[] => events.filter((event) => event.type === type);

/** Durable position of the Cognate event an AG-UI event was projected from (adapter contract). */
export const durablePosition = (event: AgUiEvent): number | undefined => {
  const raw = event.rawEvent as { cognate?: { position?: unknown } } | undefined;
  const position = raw?.cognate?.position;
  return typeof position === "number" ? position : undefined;
};
