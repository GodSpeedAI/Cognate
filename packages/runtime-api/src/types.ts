// Transport-independent runtime service and agent authoring contract (spec §8, §10, §12, §22, §32; ADR-0011).
import type { Json, StoredEvent } from "@cognate/events";
import type { Principal, SemanticRef } from "@cognate/kernel-api";
import type { StateUpdate } from "./state.ts";

// ── Agent authoring ────────────────────────────────────────────────────────────

export interface WaitSpec {
  /** Continuation type, e.g. `refund-approval`. */
  readonly type: string;
  readonly condition: Json;
  readonly payload: Json;
  /** Epoch ms. */
  readonly expiresAt?: number;
  readonly semanticRef?: SemanticRef;
}

export interface ArtifactInput {
  readonly name: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  /** Principal ids allowed to read; empty = any principal of the tenant. */
  readonly readers?: readonly string[];
  readonly representations?: readonly { readonly mediaType: string; readonly bytes: Uint8Array }[];
}

/**
 * What an agent sees while running. Every method is durable and replay-safe: results are recorded as events
 * on the run stream under a deterministic step id, and re-entry after a suspension or restart returns the
 * recorded result instead of repeating the work. Agent code must be deterministic given those results.
 */
export interface RunContext {
  readonly runId: string;
  readonly agent: string;
  readonly tenant: string;
  readonly scopeId: string;
  readonly correlationId: string;
  readonly actor: Principal;
  /** Aborted when the run is cancelled. */
  readonly signal: AbortSignal;
  /** Run a nondeterministic unit once and record its JSON result as `run.step.completed`. */
  step<T extends Json>(id: string, fn: () => T | Promise<T>): Promise<T>;
  /** Record a run-scoped fact (e.g. `message.delta`, `state.changed`). Emitted once across replays. */
  emit(eventType: string, payload: Json): Promise<void>;
  /** Resolve and invoke a capability through the kernel and policy; the result is recorded. Throws `InvocationFailedError` on typed failure. */
  invoke(capability: string, input: Json, options?: { readonly version?: string }): Promise<Json>;
  /** Produce a durable artifact attributed to this run; returns its id. */
  artifact(input: ArtifactInput): Promise<string>;
  /**
   * Suspend until a durable continuation is resolved. Returns the resolution input on resume.
   * Cancellation or expiry of the continuation fails the run with `ContinuationClosedError`.
   */
  waitFor(id: string, spec: WaitSpec): Promise<Json>;
  /**
   * Recall authorized prior knowledge relevant to `text` (spec §16). The result is recorded as a step so replay
   * is deterministic. Returns `{ status: "degraded" }` when cognition is unavailable or not configured.
   */
  recall(id: string, query: { readonly text: string; readonly k: number }): Promise<{ readonly status: "ok" | "degraded"; readonly items: readonly { readonly sourceRef: string; readonly score: number; readonly value: Json }[] }>;
  /**
   * The run's current shared state: the fold of every `state.changed` event for this run, whether emitted by the
   * agent or written by a caller through `RuntimeService.updateState`. Recorded as a step under `id`, so replay
   * returns the value that was read rather than re-reading state that may have changed since.
   */
  state(id: string): Promise<Json>;
  /**
   * A replay-safe snapshot of durable state shared by every run in this correlation/thread. The snapshot is
   * recorded under `id`, so a replay returns the value originally observed rather than a later caller edit.
   */
  sharedState(id: string): Promise<Json>;
  /** Atomically update durable thread state. The result is recorded under `id` and is replay-safe. */
  updateSharedState(id: string, update: StateUpdate): Promise<{ readonly state: Json; readonly version: number }>;
  /** Snapshot currently valid remote offers for this run's caller and agent. Recorded for replay. */
  remoteOffers(id: string): Promise<readonly RemoteCapabilityOffer[]>;
  /** Commit a call to a live remote offer as a durable continuation. */
  invokeRemoteOffer(id: string, offerId: string, input: Json, options?: { readonly expiresAt?: number }): Promise<Json>;
}

export interface AgentDefinition {
  /** Capability id the agent is published as, e.g. `agent.refund`. */
  readonly id: string;
  readonly version: string;
  /** Deterministic given recorded step results. Return value becomes the run output. */
  run(input: Json, context: RunContext): Promise<Json>;
}

export class InvocationFailedError extends Error {
  override readonly name = "InvocationFailedError";
  constructor(
    readonly capability: string,
    readonly failure: Json,
  ) {
    super(`Invocation of ${capability} failed: ${JSON.stringify(failure)}`);
  }
}

export class ContinuationClosedError extends Error {
  override readonly name = "ContinuationClosedError";
}

// ── Service ────────────────────────────────────────────────────────────────────

export type RunStatus = "running" | "waiting" | "completed" | "failed" | "cancelled";

export interface RunView {
  readonly runId: string;
  readonly agent: string;
  readonly tenant: string;
  readonly status: RunStatus;
  readonly input: Json;
  readonly output: Json;
  readonly error: string | null;
  readonly correlationId: string;
  readonly startedBy: string;
  /** Continuation ids the run is currently waiting on. */
  readonly waitingOn: readonly string[];
}

export interface ContinuationView {
  readonly id: string;
  readonly runId: string;
  readonly type: string;
  readonly status: "OPEN" | "RESUMED" | "CANCELLED" | "EXPIRED" | "FAILED" | "BLOCKED";
  readonly condition: Json;
  readonly payload: Json;
  readonly version: number;
  readonly expiresAt: number | null;
}

export type ServiceErrorCode = "not_found" | "permission_denied" | "invalid_argument" | "failed_precondition" | "unavailable" | "deadline_exceeded" | "already_exists" | "unauthenticated" | "resource_exhausted";

/** Typed service failure; transports map codes to their own status (e.g. Connect `Code`). */
export class ServiceError extends Error {
  override readonly name = "ServiceError";
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Identity of the caller as established by the transport's authenticator, never by the request body (spec §32). */
export interface Caller {
  readonly actor: Principal;
  readonly tenant: string;
}

/** A live capability advertisement from a remote caller-owned surface. */
export interface RemoteCapabilityOffer {
  /** Stable only for this offer lifetime; it never grants authority. */
  readonly id: string;
  /** Connection/session lease supplied by the offering client. */
  readonly leaseId: string;
  /** Agent for which this offer may be planned. */
  readonly agent: string;
  readonly scopeId: string;
  readonly contract: { readonly id: string; readonly version: string; readonly attributes?: Readonly<Record<string, Json>> };
  readonly description: string;
  readonly inputSchema: Json;
  readonly outputSchema?: Json;
  /** Epoch milliseconds; unavailable at and after this time. */
  readonly expiresAt: number;
}

export interface RuntimeService {
  /** `state` seeds the run's shared state (a caller-sourced `state.changed` snapshot committed with `run.started`). */
  startRun(caller: Caller, request: { readonly agent: string; readonly input: Json; readonly idempotencyKey: string; readonly correlationId?: string; readonly state?: Json }): Promise<RunView>;
  getRun(caller: Caller, request: { readonly runId: string }): Promise<RunView>;
  cancelRun(caller: Caller, request: { readonly runId: string; readonly reason: string; readonly idempotencyKey: string }): Promise<RunView>;
  /**
   * Committed events visible to the caller's tenant, in store position order, starting after `afterPosition`.
   * Follows live commits until `signal` aborts. Resume after disconnect by passing the last seen position.
   */
  events(caller: Caller, request: { readonly afterPosition?: number; readonly runId?: string; readonly correlationId?: string; readonly signal?: AbortSignal; readonly follow?: boolean }): AsyncIterable<StoredEvent>;
  listContinuations(caller: Caller, request: { readonly runId?: string; readonly status?: ContinuationView["status"] }): Promise<ContinuationView[]>;
  resolveContinuation(
    caller: Caller,
    request: { readonly continuationId: string; readonly action: "resume" | "cancel"; readonly input?: Json; readonly reason?: string; readonly idempotencyKey: string; readonly expectedVersion?: number },
  ): Promise<{ readonly outcome: "transitioned" | "duplicate" | "already_terminal"; readonly continuation: ContinuationView }>;
  invoke(caller: Caller, request: { readonly capability: string; readonly input: Json; readonly correlationId?: string; readonly idempotencyKey?: string; readonly deadline?: number }): Promise<Json>;
  getArtifact(caller: Caller, request: { readonly artifactId: string; readonly representation?: string }): Promise<{ readonly id: string; readonly name: string; readonly mediaType: string; readonly contentHash: string; readonly bytes: Uint8Array }>;
  readProjection(caller: Caller, request: { readonly name: string }): Promise<readonly { readonly key: string; readonly value: Json }[]>;
  /**
   * Write a non-terminal run's shared state as the caller: appends a caller-sourced `state.changed` event that the
   * agent observes through `RunContext.state`. Validated against the current state (`invalid_argument` if a patch
   * does not apply), authorized as `run.state.update`, idempotent by key, and optionally guarded by
   * `expectedVersion` — the count of caller writes so far (`failed_precondition` on mismatch or on a terminal run).
   */
  /**
   * Runs of the caller's tenant, oldest first by start, optionally narrowed to one correlation id (e.g. a Harness
   * `session:<id>` or an AG-UI `agui-thread:<id>`) and/or agent. Served from an index maintained atomically with
   * `run.started`, never by scanning the event log.
   */
  listRuns(caller: Caller, request: { readonly correlationId?: string; readonly agent?: string }): Promise<RunView[]>;
  updateState(
    caller: Caller,
    request: { readonly runId: string; readonly update: StateUpdate; readonly idempotencyKey: string; readonly expectedVersion?: number },
  ): Promise<{ readonly state: Json; readonly version: number }>;
  /** Read durable state shared by all runs in one caller-authorized thread. */
  readSharedState(caller: Caller, request: { readonly threadId: string }): Promise<{ readonly state: Json; readonly version: number }>;
  /**
   * Atomically update durable state shared by all runs in one caller-authorized thread. `expectedVersion` guards
   * against stale writers; `idempotencyKey` replays the recorded result without a second event.
   */
  updateSharedState(
    caller: Caller,
    request: { readonly threadId: string; readonly update: StateUpdate; readonly idempotencyKey: string; readonly expectedVersion?: number },
  ): Promise<{ readonly state: Json; readonly version: number }>;
  /** Publish or renew a caller-owned, lease-bound remote capability offer. */
  publishRemoteOffer(caller: Caller, request: { readonly leaseId: string; readonly agent: string; readonly contract: RemoteCapabilityOffer["contract"]; readonly description: string; readonly inputSchema: Json; readonly outputSchema?: Json; readonly ttlMs: number }): Promise<RemoteCapabilityOffer>;
  /** Current offers visible to this caller for planning the named agent. */
  listRemoteOffers(caller: Caller, request: { readonly agent: string }): Promise<readonly RemoteCapabilityOffer[]>;
  /** Revoke one of the caller's offers. Committed continuations remain durable. */
  revokeRemoteOffer(caller: Caller, request: { readonly offerId: string }): Promise<void>;
}
