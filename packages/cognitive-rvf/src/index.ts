import type { CognitiveEntry, CognitiveFlag, CognitiveIndex, SimilarQuery } from "@godspeedai/cognate-cognitive-api";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { RvfDatabase, RvfError, RvfErrorCode } from "@ruvector/rvf";

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
  /** test seam: overrides RvfDatabase.create (defaults to the real one). */
  readonly create?: typeof RvfDatabase.create;
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

// ---------------------------------------------------------------------------
// Internals
//
// RVF 0.3.4 facts driving this design (DEBT-006, verified against the
// installed package under Bun 1.4.0):
//  - `ingestBatch` throws `MetadataNotSupported` for any entry carrying a
//    non-empty `metadata` object, so provenance (tenant, scope, metadata,
//    embeddings, sourceRef, ...) is kept entirely in an adapter-owned
//    sidecar JSON (`<path>.entries.json`), never handed to RVF.
//  - RVF's own `NodeBackend` persists a *separate* string<->numeric-label
//    sidecar next to the `.rvf` file, named `<path>.idmap.json`. Copying the
//    `.rvf` bytes without that sidecar makes ids fall back to numeric
//    labels; every plain filesystem copy this adapter makes (snapshot,
//    verified import) copies both files together.
//  - `open()` performs no integrity verification: a truncated file or a
//    flipped byte opens silently. Cognate's own integrity digest (sha256
//    over the `.rvf` bytes + the entries sidecar bytes) is computed BEFORE
//    ever calling `open()`/`RvfDatabase.open()` on imported files.
//  - `exportBytes()`/`openBytes()` throw `BackendNotFound` on the native
//    backend, so snapshot/import always operate on file paths, never bytes.
//  - `derive()` records lineage but does not read through to the parent's
//    vectors; `branch()` gives the copy-on-write semantics this adapter's
//    `branch()` method needs (parent vectors visible to a fresh branch,
//    writes on either side isolated) and was verified empirically to
//    satisfy exactly that contract, so `branch()` calls RVF's `.branch()`.
// ---------------------------------------------------------------------------

interface SerializedEntry extends Omit<CognitiveEntry, "embedding"> {
  readonly embedding: readonly number[];
}

function copyEntry(entry: CognitiveEntry): CognitiveEntry {
  return {
    ...entry,
    embedding: Float32Array.from(entry.embedding),
    relationships: entry.relationships.map((r) => ({ ...r })),
  };
}

function serializeEntries(entries: ReadonlyMap<string, CognitiveEntry>): Record<string, SerializedEntry> {
  const out: Record<string, SerializedEntry> = {};
  for (const [id, entry] of entries) {
    out[id] = { ...entry, embedding: Array.from(entry.embedding) };
  }
  return out;
}

function deserializeEntries(raw: Record<string, SerializedEntry>): Map<string, CognitiveEntry> {
  const out = new Map<string, CognitiveEntry>();
  for (const [id, entry] of Object.entries(raw)) {
    out.set(id, { ...entry, embedding: Float32Array.from(entry.embedding) });
  }
  return out;
}

function entriesSidecarPath(path: string): string {
  return `${path}.entries.json`;
}

function idmapSidecarPath(path: string): string {
  return `${path}.idmap.json`;
}

function persistEntries(path: string, entries: ReadonlyMap<string, CognitiveEntry>): void {
  writeFileSync(entriesSidecarPath(path), JSON.stringify(serializeEntries(entries)));
}

function assertDimension(candidates: readonly CognitiveEntry[], dimension: number): void {
  for (const entry of candidates) {
    if (entry.embedding.length !== dimension) {
      throw new Error(`cognitive-rvf: expected embedding of dimension ${dimension}, got ${entry.embedding.length}`);
    }
  }
}

function computeIntegrity(rvfBytes: Uint8Array, entriesBytes: Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(rvfBytes);
  hash.update(entriesBytes);
  return `sha256:${hash.digest("hex")}`;
}

/** Copy a `.rvf` file to `destPath` together with RVF's own id-mapping sidecar, if present. */
function copyRvfFile(sourcePath: string, destPath: string): void {
  copyFileSync(sourcePath, destPath);
  const sourceIdmap = idmapSidecarPath(sourcePath);
  if (existsSync(sourceIdmap)) copyFileSync(sourceIdmap, idmapSidecarPath(destPath));
}

function buildIndex(db: RvfDatabase, path: string, dimension: number, entries: Map<string, CognitiveEntry>, id: string): RvfIndex {
  const flags = new Set<CognitiveFlag>(["vector_search", "snapshot", "branch"]);

  return {
    id,
    flags,
    dimension,

    async upsert(newEntries) {
      // Validate every entry before mutating anything: a dimension mismatch anywhere in the
      // batch must throw before any native ingest or sidecar write happens.
      assertDimension(newEntries, dimension);
      if (newEntries.length === 0) return;
      // RVF's ingestBatch replaces an existing id's vector in place (verified: re-ingesting a
      // known id keeps totalVectors unchanged and updates the stored vector), so upsert is
      // naturally idempotent by id without a delete-then-insert dance.
      await db.ingestBatch(newEntries.map((entry) => ({ id: entry.id, vector: Float32Array.from(entry.embedding) })));
      for (const entry of newEntries) entries.set(entry.id, copyEntry(entry));
      persistEntries(path, entries);
    },

    async remove(ids) {
      if (ids.length === 0) return;
      await db.delete([...ids]);
      for (const id of ids) entries.delete(id);
      persistEntries(path, entries);
    },

    async similar(query: SimilarQuery) {
      const total = entries.size;
      if (total === 0) return [];
      // RVF has no tenant/scope filter at query time: overfetch and filter here, growing k
      // until either enough matches are found or every entry has been considered (mirrors the
      // cognitive-ruvector adapter's DEBT-007 pattern).
      let k = Math.min(query.k, total);
      for (;;) {
        const raw = await db.query(Float32Array.from(query.vector), k);
        const matches: { id: string; score: number }[] = [];
        for (const hit of raw) {
          const entry = entries.get(hit.id);
          if (!entry) continue; // no provenance for this id; never disclose it
          if (entry.tenant !== query.tenant) continue;
          if (query.scopeIds && query.scopeIds.length > 0 && !query.scopeIds.includes(entry.scopeId)) continue;
          // RVF's distance is 0 = identical; convert to a similarity score so higher = closer.
          matches.push({ id: hit.id, score: 1 / (1 + hit.distance) });
        }
        if (matches.length >= query.k || k >= total) {
          return matches.sort((a, b) => b.score - a.score).slice(0, query.k);
        }
        k = Math.min(total, k * 2);
      }
    },

    async get(id) {
      const entry = entries.get(id);
      return entry ? copyEntry(entry) : undefined;
    },

    async count() {
      return entries.size;
    },

    async clear() {
      const ids = Array.from(entries.keys());
      if (ids.length > 0) await db.delete(ids);
      entries.clear();
      persistEntries(path, entries);
    },

    async close() {
      await db.close();
      entries.clear();
    },

    async snapshot(store, options) {
      const behind = options.indexedThrough < options.storeHead;
      if (behind && options.onBehind === "fail") {
        throw new Error(
          `cognitive-rvf: indexed position ${options.indexedThrough} is behind store head ${options.storeHead}; refusing to snapshot (onBehind: "fail")`,
        );
      }
      const checkpoint = { position: options.indexedThrough, partial: behind };

      // Nothing below this line touches the active index or the durable store until every file
      // has been written successfully (spec §31.4: a failed snapshot must not corrupt either).
      mkdirSync(options.dir, { recursive: true });
      const rvfDest = join(options.dir, `${options.name}.rvf`);
      const entriesDest = join(options.dir, `${options.name}.entries.json`);
      const manifestDest = join(options.dir, `${options.name}.manifest.json`);

      copyRvfFile(path, rvfDest);
      writeFileSync(entriesDest, JSON.stringify(serializeEntries(entries)));

      const rvfBytes = readFileSync(rvfDest);
      const entriesBytes = readFileSync(entriesDest);
      const integrity = computeIntegrity(rvfBytes, entriesBytes);
      const tenants = Array.from(new Set(Array.from(entries.values(), (e) => e.tenant))).sort();

      const manifest: RvfManifest = {
        format: "cognate.rvf.v1",
        frameworkVersion: options.frameworkVersion,
        cognitiveSchemaVersion: "1",
        lineage: options.lineage,
        checkpoint,
        semanticSourceVersion: options.semanticSourceVersion ?? null,
        snapshotId: randomUUID(),
        parentSnapshotId: null,
        createdAt: new Date().toISOString(),
        tenants,
        entryCount: entries.size,
        integrity,
        realityTraceRef: null,
      };
      writeFileSync(manifestDest, JSON.stringify(manifest, null, 2));

      // Only now record durably: every file this manifest describes already exists on disk.
      await store.commit({
        appends: [],
        records: [{ collection: "rvf_snapshots", id: manifest.snapshotId, expectedVersion: 0, value: manifest as unknown as { readonly [key: string]: Json } }],
      });
      return manifest;
    },

    async branch(childPath) {
      const childDb = await db.branch(childPath);
      const childEntries = new Map<string, CognitiveEntry>();
      for (const [entryId, entry] of entries) childEntries.set(entryId, copyEntry(entry));
      persistEntries(childPath, childEntries);
      return buildIndex(childDb, childPath, dimension, childEntries, id);
    },

    async lineage() {
      const [fileId, rawParentId, depth] = await Promise.all([db.fileId(), db.parentId(), db.lineageDepth()]);
      const parentId = /^0+$/.test(rawParentId) ? null : rawParentId;
      return { fileId, parentId, depth };
    },
  };
}

/**
 * Open a fresh RVF-backed index at `options.path`. Never trusts a pre-existing file: derived
 * cognitive state is rebuilt from events by the indexer projection, so — exactly like the
 * cognitive-ruvector adapter — opening resets the backing file (and its sidecars) to guarantee
 * RVF never silently serves an entry this adapter has no provenance for. The only way to open an
 * existing RVF file with its entries intact is `importSnapshot`, which verifies it first.
 */
/** Total attempts `createRvfIndex` makes when the native backend reports FsyncFailed (DEBT-018). */
const RVF_CREATE_ATTEMPTS = 5;

/** True when RVF reported a transient fsync failure; matched by error code, never by message. */
export function isFsyncFailed(err: unknown): boolean {
  return err instanceof RvfError && err.code === RvfErrorCode.FsyncFailed;
}

function removeRvfFiles(path: string): void {
  try {
    rmSync(path, { force: true });
    rmSync(idmapSidecarPath(path), { force: true });
    rmSync(entriesSidecarPath(path), { force: true });
  } catch {
    // best effort; RvfDatabase.create below surfaces a real failure if the path is unusable.
  }
}

async function createWithFsyncRetry(create: typeof RvfDatabase.create, path: string, dimension: number): Promise<RvfDatabase> {
  for (let attempt = 1; ; attempt++) {
    removeRvfFiles(path);
    try {
      return await create(path, { dimensions: dimension, overwrite: true });
    } catch (error) {
      if (!isFsyncFailed(error) || attempt >= RVF_CREATE_ATTEMPTS) throw error;
      await Bun.sleep(50 * attempt);
    }
  }
}

export async function createRvfIndex(options: RvfIndexOptions): Promise<RvfIndex> {
  const { path, dimension } = options;
  const create = options.create ?? RvfDatabase.create.bind(RvfDatabase);
  const db = await createWithFsyncRetry(create, path, dimension);
  const entries = new Map<string, CognitiveEntry>();
  persistEntries(path, entries);
  return buildIndex(db, path, dimension, entries, options.id ?? "rvf");
}

/**
 * Verify and open a snapshot (spec §18.3): manifest present and supported, integrity digest matches, entry and byte
 * limits respected, every tenant allowed. Attached only when lineage matches, the checkpoint is not beyond the store
 * head, and `rvf_snapshots` records the same integrity; otherwise detached. Compute segments are never executed.
 */
export async function importSnapshot(store: DurableStore, manifestPath: string, options: ImportOptions): Promise<ImportResult> {
  let manifestRaw: string;
  try {
    manifestRaw = readFileSync(manifestPath, "utf8");
  } catch {
    return { kind: "rejected", reason: "manifest file not found" };
  }

  let manifest: RvfManifest;
  try {
    manifest = JSON.parse(manifestRaw) as RvfManifest;
  } catch {
    return { kind: "rejected", reason: "manifest is not valid JSON" };
  }
  if (!manifest || typeof manifest !== "object" || manifest.format !== "cognate.rvf.v1") {
    return { kind: "rejected", reason: "unsupported snapshot format" };
  }

  const dir = dirname(manifestPath);
  const name = basename(manifestPath).replace(/\.manifest\.json$/, "");
  const rvfPath = join(dir, `${name}.rvf`);
  const entriesPath = join(dir, `${name}.entries.json`);

  let rvfBytes: Buffer;
  let entriesBytes: Buffer;
  try {
    rvfBytes = readFileSync(rvfPath);
    entriesBytes = readFileSync(entriesPath);
  } catch {
    return { kind: "rejected", reason: "snapshot data file is missing" };
  }

  const integrity = computeIntegrity(rvfBytes, entriesBytes);
  if (integrity !== manifest.integrity) {
    return { kind: "rejected", reason: "integrity mismatch: snapshot bytes do not match the manifest digest" };
  }
  if (manifest.entryCount > options.maxEntries) {
    return { kind: "rejected", reason: `entryCount ${manifest.entryCount} exceeds maxEntries ${options.maxEntries}` };
  }
  const totalBytes = rvfBytes.byteLength + entriesBytes.byteLength;
  if (totalBytes > options.maxBytes) {
    return { kind: "rejected", reason: `snapshot size ${totalBytes} exceeds maxBytes ${options.maxBytes}` };
  }
  for (const tenant of manifest.tenants) {
    if (!options.allowedTenants.includes(tenant)) {
      return { kind: "rejected", reason: `tenant "${tenant}" is not in allowedTenants` };
    }
  }

  // Verified: never mutate the source snapshot files — open a copy at a fresh working path.
  // Compute segments (kernel/eBPF) are never touched: only the vec/manifest bytes and the
  // Cognate-owned entries sidecar are read here.
  const workingPath = join(tmpdir(), `cognate-rvf-import-${randomUUID()}.rvf`);
  copyRvfFile(rvfPath, workingPath);
  writeFileSync(entriesSidecarPath(workingPath), entriesBytes);
  const entries = deserializeEntries(JSON.parse(entriesBytes.toString("utf8")) as Record<string, SerializedEntry>);

  const db = await RvfDatabase.open(workingPath);
  const dimension = await db.dimension();
  const index = buildIndex(db, workingPath, dimension, entries, "rvf");

  const record = await store.getRecord("rvf_snapshots", manifest.snapshotId);
  const registered = record !== undefined && (record.value as { integrity?: unknown }).integrity === manifest.integrity;
  const lineageMatches = manifest.lineage === options.lineage;
  const withinHead = manifest.checkpoint.position <= options.storeHead;

  if (lineageMatches && withinHead && registered) {
    return { kind: "attached", index, manifest, reason: "lineage matches, checkpoint is at or before the store head, and the snapshot is recorded in this store" };
  }
  const reasons: string[] = [];
  if (!lineageMatches) reasons.push("lineage does not match this store's application lineage");
  if (!withinHead) reasons.push("checkpoint position is beyond the current store head");
  if (!registered) reasons.push("snapshot is not recorded (or recorded with a different digest) in this store");
  return { kind: "detached", index, manifest, reason: reasons.join("; ") };
}
