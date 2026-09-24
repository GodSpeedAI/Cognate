import type { Json, StoredEvent } from "@cognate/events";
import type { Caller, ContinuationView, RunView, RuntimeService } from "@cognate/runtime-api";

/** A minimal observable value, framework-neutral (React bindings adapt it with useSyncExternalStore). */
export interface Readable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "closed";

/** Run state derived only from the run's durable events (spec §25.1 shared state; §31.8 reconnect). */
export interface RunState {
  readonly runId: string;
  readonly status: RunView["status"] | "unknown";
  /** Concatenated `message.delta` text in stream order. */
  readonly text: string;
  /** Shared state object built from `state.changed` events: `{ patch: JsonPatch }` or `{ snapshot: Json }` payloads. */
  readonly state: Json;
  readonly openContinuations: readonly ContinuationView[];
  readonly artifacts: readonly string[];
  readonly output: Json;
  readonly error: string | null;
  /** Last applied store position. */
  readonly position: number;
}

export interface ClientOptions {
  readonly service: RuntimeService;
  readonly caller: Caller;
  /** Reconnect backoff for event streams (default 50 ms doubling to 2 s). */
  readonly reconnect?: { readonly baseMs: number; readonly maxMs: number };
}

export type FrontendHandler = (input: Json, context: { readonly runId: string; readonly continuationId: string }) => Json | Promise<Json>;

export interface CognateClient {
  readonly status: Readable<ConnectionStatus>;
  startRun(agent: string, input: Json, options?: { readonly idempotencyKey?: string; readonly correlationId?: string }): Promise<RunView>;
  cancelRun(runId: string, reason: string): Promise<RunView>;
  /** Live, reconnecting, derived state of one run. */
  run(runId: string): Readable<RunState>;
  /** Subscribe to tenant events from a position with automatic resume after disconnect; no gaps, no duplicates. */
  subscribe(options: { readonly afterPosition?: number; readonly runId?: string }, listener: (event: StoredEvent) => void): () => void;
  /** A public projection, refreshed when events commit. */
  projection(name: string): Readable<readonly { readonly key: string; readonly value: Json }[] | undefined>;
  resolveContinuation(continuationId: string, action: "resume" | "cancel", input?: Json, options?: { readonly expectedVersion?: number; readonly reason?: string }): Promise<ContinuationView>;
  /**
   * Serve a frontend capability: open `frontend_capability` continuations naming it are executed locally and
   * resolved with `{ ok, value | error }`. Returns an unregister function.
   */
  provideCapability(capability: string, handler: FrontendHandler): () => void;
  /** Perform a semantic action through the runtime's authorized capability path. */
  invoke(capability: string, input: Json): Promise<Json>;
  artifact(artifactId: string, representation?: string): Promise<{ readonly name: string; readonly mediaType: string; readonly bytes: Uint8Array }>;
  close(): Promise<void>;
}

export function createClient(_options: ClientOptions): CognateClient {
  throw new Error("client: not implemented");
}
