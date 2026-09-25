// Run state is a fold over the run stream (spec §10, §32): nothing returned to callers is a stored copy,
// so erasing an event payload removes its content from every view derived here.
import type { Json, StoredEvent } from "@cognate/events";
import type { RunView } from "@cognate/runtime-api";

export const RUN_EXECUTE_TOPIC = "run.execute";
export const RESUME_HANDLER = { id: "run.resume", version: "1" } as const;
export const RUNS = "runs";

export const runStream = (runId: string) => `run-${runId}`;
/** Caller-sourced state writes land here, never on the run stream (spec §29.1): a foreign append to the run
 * stream would race the executor's own `expectedVersion` and cause spurious ConcurrencyError/halt churn. */
export const runStateStream = (runId: string) => `run-state-${runId}`;

export type Meta = { readonly [key: string]: Json };

export function meta(event: StoredEvent): Meta {
  return event.metadata ?? {};
}

export function field<T extends Json>(value: Json | undefined, key: string): T | null {
  if (value && typeof value === "object" && !Array.isArray(value) && key in value) return value[key] as T;
  return null;
}

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function isTerminal(view: RunView): boolean {
  return TERMINAL.has(view.status);
}

/** Fold a run stream into its view; `undefined` when the stream is not a run. */
export function foldRun(runId: string, events: readonly StoredEvent[]): RunView | undefined {
  const first = events[0];
  if (!first || first.eventType !== "run.started") return undefined;
  const m = meta(first);
  let status: RunView["status"] = "running";
  let output: Json = null;
  let error: string | null = null;
  const waiting = new Set<string>();
  for (const event of events) {
    const continuationId = field<string>(meta(event), "continuationId");
    switch (event.eventType) {
      case "run.waiting":
        if (continuationId) waiting.add(continuationId);
        break;
      case "run.resumed":
      case "run.wait.closed":
        if (continuationId) waiting.delete(continuationId);
        break;
      case "run.completed":
        status = "completed";
        output = field(event.payload, "output");
        break;
      case "run.failed":
        status = "failed";
        error = field<string>(event.payload, "error");
        break;
      case "run.cancelled":
        status = "cancelled";
        break;
    }
  }
  if (!TERMINAL.has(status)) status = waiting.size > 0 ? "waiting" : "running";
  else waiting.clear();
  return {
    runId,
    agent: field<string>(m, "agent") ?? "",
    tenant: first.tenant,
    status,
    input: field(first.payload, "input"),
    output,
    error,
    correlationId: first.correlationId,
    startedBy: field<string>(m, "startedBy") ?? "",
    waitingOn: [...waiting],
  };
}

/** Coerce provider/agent values into JSON (drops functions and undefined, like the wire would). */
export function toJson(value: unknown): Json {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as Json;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
