import type { CognitiveIndex } from "@cognate/cognitive-api";
import type { DurableStore } from "@cognate/events";

/** Cognate-owned sidecar manifest (spec §18.2). RVF 0.3.4 does not verify integrity on open (DEBT-006). */
export interface RvfManifest {
  readonly format: "cognate.rvf.v1";
  readonly frameworkVersion: string;
  readonly cognitiveSchemaVersion: string;
  /** Application lineage id: which authoritative history this cognition derives from. */
  readonly lineage: string;
  /** Source event checkpoint (store position) the index generation had processed. */
  readonly checkpoint: { readonly position: number; readonly partial: boolean };
  readonly semanticSourceVersion: string | null;
  readonly snapshotId: string;
  readonly parentSnapshotId: string | null;
  readonly createdAt: string;
  readonly tenants: readonly string[];
  readonly entryCount: number;
  /** sha256 over the .rvf bytes and the entries sidecar. */
  readonly integrity: string;
  readonly realityTraceRef: string | null;
}

export interface RvfIndexOptions {
  readonly path: string;
  readonly dimension: number;
  readonly id?: string;
}

export interface SnapshotOptions {
  /** Where to write `<name>.rvf`, its entries sidecar, and `<name>.manifest.json`. */
  readonly dir: string;
  readonly name: string;
  readonly lineage: string;
  /** Position the cognitive projection has processed through. */
  readonly indexedThrough: number;
  /** Latest authoritative store position; if indexing is behind, `onBehind` decides. */
  readonly storeHead: number;
  readonly onBehind: "fail" | "partial";
  readonly frameworkVersion: string;
  readonly semanticSourceVersion?: string;
}

export interface ImportOptions {
  readonly lineage: string;
  /** Current authoritative store head; a checkpoint beyond it cannot be attached. */
  readonly storeHead: number;
  readonly allowedTenants: readonly string[];
  readonly maxEntries: number;
  readonly maxBytes: number;
}

export type ImportResult =
  | { readonly kind: "attached" | "detached"; readonly index: RvfIndex; readonly manifest: RvfManifest; readonly reason: string }
  | { readonly kind: "rejected"; readonly reason: string };

/** An RVF-backed index. Flags: vector_search, snapshot, branch. */
export interface RvfIndex extends CognitiveIndex {
  /** Write a snapshot + manifest and record it in collection `rvf_snapshots` (spec §13.1). */
  snapshot(store: DurableStore, options: SnapshotOptions): Promise<RvfManifest>;
  /** Copy-on-write branch; writes to either side stay isolated (spec §18.1). */
  branch(path: string): Promise<RvfIndex>;
  /** Lineage from RVF itself (parent file id, depth). */
  lineage(): Promise<{ readonly fileId: string; readonly parentId: string | null; readonly depth: number }>;
}

export function createRvfIndex(_options: RvfIndexOptions): Promise<RvfIndex> {
  throw new Error("cognitive-rvf: not implemented");
}

/**
 * Verify and open a snapshot (spec §18.3): manifest present and supported, integrity digest matches, entry and byte
 * limits respected, every tenant allowed. Attached only when lineage matches, the checkpoint is not beyond the store
 * head, and `rvf_snapshots` records the same integrity; otherwise detached. Compute segments are never executed.
 */
export function importSnapshot(_store: DurableStore, _manifestPath: string, _options: ImportOptions): Promise<ImportResult> {
  throw new Error("cognitive-rvf: not implemented");
}
