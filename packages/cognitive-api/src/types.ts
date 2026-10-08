// Dependency-free cognitive contract (spec §14–16). No RuVector type may appear here.
import type { Json } from "@godspeedai/events";
import type { Principal, SemanticRef } from "@godspeedai/kernel-api";

export type CognitiveFlag = "vector_search" | "graph_traversal" | "temporal_search" | "causal_search" | "adaptive_ranking" | "snapshot" | "branch" | "witness";

export type SourceType = "semantic" | "event" | "artifact" | "run" | "tool_outcome" | "continuation_outcome" | "observation" | "knowledge";

/** A derived retrieval aid. `sourceRef` is the route back to truth (spec §15). */
export interface CognitiveEntry {
  readonly id: string;
  readonly sourceType: SourceType;
  /** e.g. `event:<eventId>`, `artifact:<artifactId>`, `semantic:<namespace::name>`. */
  readonly sourceRef: string;
  readonly tenant: string;
  readonly scopeId: string;
  readonly semanticRef: SemanticRef | null;
  readonly eventRef: string | null;
  readonly traceRef: string | null;
  readonly embedding: Float32Array;
  /** Non-sensitive metadata only; content stays in the authoritative source (spec §32). */
  readonly metadata: { readonly [key: string]: Json };
  readonly relationships: readonly { readonly type: string; readonly target: string }[];
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly indexerVersion: string;
  /** False for ephemeral or detached material, excluded from the rebuildability guarantee. */
  readonly durable: boolean;
}

export interface SimilarQuery {
  readonly vector: Float32Array;
  readonly k: number;
  readonly tenant: string;
  /** Restrict to these scopes when the index can filter before disclosure; callers still post-filter. */
  readonly scopeIds?: readonly string[];
}

export interface CognitiveIndex {
  readonly id: string;
  /** Honest capability flags: only operations proven by the implementation's fixtures (spec §14). */
  readonly flags: ReadonlySet<CognitiveFlag>;
  readonly dimension: number;
  /** Idempotent by entry id. */
  upsert(entries: readonly CognitiveEntry[]): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  /** Candidate ids ordered by similarity (highest first). Never authoritative. */
  similar(query: SimilarQuery): Promise<readonly { readonly id: string; readonly score: number }[]>;
  /** Inspect provenance of one entry. */
  get(id: string): Promise<CognitiveEntry | undefined>;
  /** Present only with `graph_traversal`. */
  related?(id: string, options: { readonly types?: readonly string[]; readonly depth: number }): Promise<readonly string[]>;
  count(): Promise<number>;
  /** Delete all derived entries (the "delete cognitive index" operation of spec §3.5). */
  clear(): Promise<void>;
  close(): Promise<void>;
}

export interface Embedder {
  readonly id: string;
  readonly dimension: number;
  embed(texts: readonly string[]): Promise<Float32Array[]>;
}

/** Authoritative dereference with authorization (spec §16, §32). */
export type SourceResolution = { readonly kind: "ok"; readonly value: Json } | { readonly kind: "denied" } | { readonly kind: "missing" };

export interface SourceResolver {
  resolve(sourceRef: string, actor: Principal, tenant: string): Promise<SourceResolution>;
}

export interface RecallQuery {
  readonly text: string;
  readonly actor: Principal;
  readonly tenant: string;
  readonly scopeIds: readonly string[];
  readonly k: number;
  /** When true, an unavailable index is an error instead of a degraded empty result (spec §31.3). */
  readonly required?: boolean;
}

export interface RecallItem {
  readonly sourceRef: string;
  readonly sourceType: SourceType;
  readonly score: number;
  /** Authoritative content fetched after authorization. */
  readonly value: Json;
  readonly semanticRef: SemanticRef | null;
}

export type RecallResult =
  | { readonly status: "ok"; readonly items: readonly RecallItem[] }
  /** Index unavailable: deterministic callers continue without cognition. */
  | { readonly status: "degraded"; readonly items: readonly []; readonly reason: string };
