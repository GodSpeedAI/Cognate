import type { Json } from "@godspeedai/cognate-events";
import type { Principal, SemanticRef } from "@godspeedai/cognate-kernel-api";

export type ContinuationStatus = "OPEN" | "RESUMED" | "CANCELLED" | "EXPIRED" | "FAILED" | "BLOCKED";

/** Persisted continuation (spec §12). Never holds closures; resume goes through a registered handler id/version. */
export interface ContinuationRecord {
  readonly id: string;
  readonly type: string;
  readonly tenant: string;
  readonly runId: string;
  readonly scopeId: string;
  readonly correlationId: string;
  /** Machine-readable satisfaction condition, e.g. `{ kind: "human_approval", role: "manager" }`. */
  readonly condition: Json;
  readonly payload: Json;
  readonly handler: { readonly id: string; readonly version: string };
  readonly semanticRef: SemanticRef | null;
  /** Semantic projection version needed to interpret `payload`. */
  readonly semanticProjectionVersion: string | null;
  /** Epoch ms, or null for no expiry. */
  readonly expiresAt: number | null;
  readonly ownerComponentId: string | null;
  readonly status: ContinuationStatus;
  readonly version: number;
  readonly createdEventId: string;
  readonly resolution: { readonly eventId: string; readonly actorId: string; readonly input: Json; readonly reason: string | null } | null;
}

export interface OpenContinuation {
  readonly id?: string;
  readonly type: string;
  readonly tenant: string;
  readonly runId: string;
  readonly scopeId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly condition: Json;
  readonly payload: Json;
  readonly handler: { readonly id: string; readonly version: string };
  readonly semanticRef?: SemanticRef;
  readonly semanticProjectionVersion?: string;
  readonly expiresAt?: number;
  readonly ownerComponentId?: string;
}

export interface ContinuationAction {
  readonly actor: Principal;
  readonly idempotencyKey: string;
  /** Reject when the stored version differs (compare-and-swap from the caller's view). */
  readonly expectedVersion?: number;
}

export type TransitionOutcome =
  | { readonly kind: "transitioned"; readonly record: ContinuationRecord }
  /** Idempotent replay of the same request. */
  | { readonly kind: "duplicate"; readonly record: ContinuationRecord }
  /** Another terminal transition won the race. */
  | { readonly kind: "already_terminal"; readonly record: ContinuationRecord }
  | { readonly kind: "denied"; readonly reason: string }
  | { readonly kind: "version_mismatch"; readonly record: ContinuationRecord }
  | { readonly kind: "not_found" };

export interface ContinuationPolicy {
  authorize(request: { readonly actor: Principal; readonly action: "resume" | "cancel"; readonly continuation: ContinuationRecord }): { readonly allow: boolean; readonly reason: string };
}

/** A resume handler for one continuation handler id. `supports` decides version compatibility. */
export interface ResumeHandler {
  readonly id: string;
  readonly version: string;
  supports(storedVersion: string): boolean;
  handle(record: ContinuationRecord): Promise<void>;
}

export type CommitmentState = "INTENDED" | "DISPATCHING" | "SUCCEEDED" | "FAILED" | "UNKNOWN_RECONCILIATION_REQUIRED";

/** Durable external commitment record (spec §9.3). */
export interface CommitmentRecord {
  readonly id: string;
  readonly targetId: string;
  readonly operation: string;
  readonly idempotencyKey: string;
  readonly payload: Json;
  /** Target's documented dedup guarantee: true only if retries with the same key are safe. */
  readonly targetIdempotent: boolean;
  readonly dedupRetentionMs: number | null;
  readonly attempts: number;
  readonly remoteRef: string | null;
  readonly result: Json;
  readonly lastError: string | null;
  readonly state: CommitmentState;
  /** Set for a compensation: the commitment it compensates. The original is never modified. */
  readonly compensates: string | null;
  readonly version: number;
}

/** Throw from `dispatch` when the target definitively rejected the request (the effect did not happen). */
export class CommitmentRejectedError extends Error {
  override readonly name = "CommitmentRejectedError";
}

export interface CommitmentTarget {
  readonly id: string;
  /** True only if the target documents deduplication by idempotency key. */
  readonly idempotent: boolean;
  readonly dedupRetentionMs?: number;
  /** Perform the external action. A timeout or lost response must throw a non-Rejected error. */
  dispatch(request: { readonly commitmentId: string; readonly idempotencyKey: string; readonly operation: string; readonly payload: Json; readonly attempt: number }, signal: AbortSignal): Promise<{ readonly remoteRef: string; readonly result: Json }>;
  /** Optional status query used to reconcile UNKNOWN outcomes. */
  status?(request: { readonly commitmentId: string; readonly idempotencyKey: string }): Promise<{ readonly state: "succeeded"; readonly remoteRef: string; readonly result: Json } | { readonly state: "failed"; readonly error: string } | { readonly state: "unknown" }>;
}
