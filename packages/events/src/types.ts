// Durable state plane contract (spec §7.3, §10, §11, §13). Stores implement `DurableStore`.
import type { SemanticRef } from "@cognate/kernel-api";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** An event as submitted by a decision; the store assigns ids, sequence, position, and recorded time. */
export interface NewEvent {
  readonly eventType: string;
  readonly schemaVersion: number;
  /** Source-claimed time (ISO-8601). Provenance only; never ordering authority. */
  readonly occurredAt: string;
  readonly tenant: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly runId: string | null;
  readonly scopeId: string;
  readonly componentId?: string;
  readonly fiberId?: string;
  readonly semanticRef?: SemanticRef;
  readonly payload: Json;
  readonly metadata?: { readonly [key: string]: Json };
  /** Optional caller-chosen id (e.g. for deterministic replays); otherwise the store assigns one. */
  readonly eventId?: string;
}

/** Canonical stored envelope (spec §10). */
export interface StoredEvent extends Omit<NewEvent, "eventId" | "payload"> {
  readonly eventId: string;
  readonly streamId: string;
  /** 1-based, gap-free per stream; the ordering authority within a stream. */
  readonly streamSequence: number;
  /** Store-wide commit order; the checkpoint contract for cross-stream projections. */
  readonly position: number;
  /** Store acceptance time (ISO-8601). */
  readonly recordedAt: string;
  /** `null` after erasure; see `erasure`. */
  readonly payload: Json;
  readonly erasure?: { readonly reason: string; readonly erasedAt: string };
}

export interface StreamAppend {
  readonly streamId: string;
  /** Current stream version the decision was made against; 0 for a new stream. */
  readonly expectedVersion: number;
  readonly events: readonly NewEvent[];
}

/** A compare-and-swap write of a versioned durable record (runs, continuations, commitments, artifacts). */
export interface RecordWrite {
  readonly collection: string;
  readonly id: string;
  /** 0 means the record must not exist yet. */
  readonly expectedVersion: number;
  readonly value: { readonly [key: string]: Json };
}

export interface StoredRecord {
  readonly collection: string;
  readonly id: string;
  readonly version: number;
  readonly value: { readonly [key: string]: Json };
}

/** Work to perform outside the SQLite transaction after commit (spec §13.1). */
export interface OutboxIntent {
  /** Stable id used for deduplication by the target. */
  readonly id: string;
  readonly topic: string;
  readonly payload: Json;
}

export type OutboxStatus = "pending" | "delivered" | "poisoned";

export interface OutboxItem extends OutboxIntent {
  readonly status: OutboxStatus;
  readonly attempts: number;
  /** Epoch ms at which the item may next be claimed. */
  readonly availableAt: number;
  readonly lastError: string | null;
  readonly receipt: Json;
  readonly createdAt: string;
}

export type OutboxSettlement =
  | { readonly kind: "delivered"; readonly receipt: Json }
  | { readonly kind: "retry"; readonly error: string; readonly retryAt: number }
  | { readonly kind: "poisoned"; readonly error: string };

export interface Idempotency {
  /** Caller + operation namespace (spec §10: key scoped to caller and operation). */
  readonly scope: string;
  readonly key: string;
  /** Hash of the request; reusing a key with a different request is an error, not a replay. */
  readonly fingerprint: string;
}

/** One decision: everything here commits atomically or not at all (spec §10, §13.1). */
export interface CommitRequest {
  readonly idempotency?: Idempotency;
  readonly appends: readonly StreamAppend[];
  readonly records?: readonly RecordWrite[];
  readonly outbox?: readonly OutboxIntent[];
  /** Recorded command result, returned verbatim on idempotent replay. */
  readonly result?: Json;
}

export type CommitOutcome =
  | { readonly kind: "committed"; readonly events: readonly StoredEvent[]; readonly records: readonly StoredRecord[]; readonly result: Json }
  | { readonly kind: "duplicate"; readonly events: readonly StoredEvent[]; readonly result: Json };

export interface ProjectionCheckpoint {
  readonly name: string;
  /** Projection code version; a different version requires rebuild. */
  readonly version: string;
  /** Last fully applied store position. */
  readonly position: number;
  readonly status: "ok" | "error";
  readonly error: { readonly position: number; readonly eventId: string; readonly message: string } | null;
}

export interface ProjectionCommit {
  readonly name: string;
  readonly version: string;
  /** Must equal the stored position (CAS); prevents two runners advancing the same projection. */
  readonly fromPosition: number;
  readonly toPosition: number;
  /** Key/value state writes; `null` deletes. Committed atomically with the checkpoint. */
  readonly writes: readonly { readonly key: string; readonly value: Json | null }[];
}

export interface DurableStore {
  /** Atomically apply one decision. Throws ConcurrencyError / RecordConflictError / IdempotencyMismatchError; fails closed. */
  commit(request: CommitRequest): Promise<CommitOutcome>;
  streamVersion(streamId: string): Promise<number>;
  readStream(streamId: string, options?: { readonly afterSequence?: number; readonly limit?: number }): Promise<StoredEvent[]>;
  /** Events in store position order across all streams. */
  readAll(options?: { readonly afterPosition?: number; readonly limit?: number }): Promise<StoredEvent[]>;
  getEvent(eventId: string): Promise<StoredEvent | undefined>;
  /** Subscribe to committed events (in commit order); called only after the transaction commits. */
  onCommitted(listener: (events: readonly StoredEvent[]) => void): () => void;

  getRecord(collection: string, id: string): Promise<StoredRecord | undefined>;
  /** Records whose top-level fields equal every `where` entry, ordered by id (code-point order). */
  listRecords(collection: string, where?: { readonly [field: string]: string | number | boolean | null }): Promise<StoredRecord[]>;

  claimOutbox(options: { readonly topic: string; readonly now: number; readonly limit: number; readonly leaseMs: number }): Promise<OutboxItem[]>;
  settleOutbox(id: string, settlement: OutboxSettlement): Promise<void>;
  /** Operator replay path for a poisoned item. */
  requeueOutbox(id: string, now: number): Promise<void>;
  listOutbox(options?: { readonly topic?: string; readonly status?: OutboxStatus }): Promise<OutboxItem[]>;

  getProjection(name: string): Promise<ProjectionCheckpoint | undefined>;
  commitProjection(commit: ProjectionCommit): Promise<void>;
  /** Record a poison event without advancing the checkpoint. */
  failProjection(name: string, error: { readonly position: number; readonly eventId: string; readonly message: string }): Promise<void>;
  readProjection(name: string, key: string): Promise<Json | undefined>;
  /** All state entries ordered by key (code-point order), so replay comparisons are store-independent. */
  listProjection(name: string): Promise<{ readonly key: string; readonly value: Json }[]>;
  /** Delete a projection's state and checkpoint (derived data only). */
  resetProjection(name: string): Promise<void>;

  /** Content-addressed bytes; returns `sha256:<hex>`. Idempotent. */
  putBlob(bytes: Uint8Array): Promise<string>;
  getBlob(hash: string): Promise<Uint8Array | undefined>;
  deleteBlob(hash: string): Promise<void>;

  /** Remove an event's payload, keep its envelope, and append an `erasure.recorded` event to stream `$erasures` (spec §32). */
  erasePayload(eventId: string, reason: string, actorId: string): Promise<void>;

  close(): Promise<void>;
}

export interface StoreHandle {
  readonly store: DurableStore;
  /** Close and reopen the same durable location (persistent stores only). */
  readonly reopen?: () => Promise<DurableStore>;
  dispose(): Promise<void>;
}

export type StoreFactory = () => Promise<StoreHandle>;
