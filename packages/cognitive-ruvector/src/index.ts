import type { CognitiveEntry, CognitiveFlag, CognitiveIndex, SimilarQuery } from "@cognate/cognitive-api";
import { rmSync } from "node:fs";

export interface RuVectorIndexOptions {
  readonly dimension: number;
  /** Required: RuVector otherwise persists to ./ruvector.db in the working directory (DEBT-007). */
  readonly storagePath: string;
  readonly id?: string;
}

interface NativeSearchHit {
  readonly id: string;
  readonly score: number;
}

interface NativeVectorDb {
  insert(entry: { id?: string; vector: Float32Array }): Promise<string>;
  delete(id: string): Promise<boolean>;
  search(query: { vector: Float32Array; k: number }): Promise<NativeSearchHit[]>;
}

function copyEntry(entry: CognitiveEntry): CognitiveEntry {
  return {
    ...entry,
    embedding: Float32Array.from(entry.embedding),
    relationships: entry.relationships.map((r) => ({ ...r })),
  };
}

/**
 * RuVector-backed CognitiveIndex (reference implementation; vector_search only, per ADR-0004 / DEBT-007).
 *
 * RuVector is treated purely as a similarity-search accelerator. All provenance (the full
 * CognitiveEntry, including embeddings) is kept in an adapter-owned map, which is the only
 * source of truth for `get`, and the only place tenant/scope filtering happens (DEBT-007:
 * RuVector's `search` `filter` option does not actually filter). The index does not persist
 * across process restarts even though RuVector's on-disk file would survive one: derived
 * cognitive state is rebuilt from events by the indexer projection, so on open we reset the
 * backing file to guarantee RuVector never silently serves an entry this adapter has no
 * provenance for.
 */
export async function createRuVectorIndex(options: RuVectorIndexOptions): Promise<CognitiveIndex> {
  const { dimension, storagePath } = options;

  // Never trust a pre-existing file at storagePath: the adapter map (the only source of
  // provenance) always starts empty, so RuVector's own store must start empty too.
  try {
    rmSync(storagePath, { force: true });
  } catch {
    // best effort; the VectorDb constructor below will surface a real failure if the path is unusable.
  }

  const { VectorDb } = await import("@ruvector/core");
  const db = new VectorDb({ dimensions: dimension, storagePath, distanceMetric: "Cosine" }) as NativeVectorDb;

  const entries = new Map<string, CognitiveEntry>();
  const flags = new Set<CognitiveFlag>(["vector_search"]);

  async function nativeUpsertOne(entry: CognitiveEntry): Promise<void> {
    // Idempotent by id: delete-then-insert keeps count correct regardless of whether a given
    // RuVector version treats insert-by-existing-id as a replace or an add.
    await db.delete(entry.id);
    await db.insert({ id: entry.id, vector: Float32Array.from(entry.embedding) });
  }

  return {
    id: options.id ?? "ruvector",
    flags,
    dimension,

    async upsert(newEntries) {
      // Validate every entry before mutating anything: a dimension mismatch anywhere in the
      // batch must throw before any native insert or map write happens.
      for (const entry of newEntries) {
        if (entry.embedding.length !== dimension) {
          throw new Error(`cognitive-ruvector: expected embedding of dimension ${dimension}, got ${entry.embedding.length}`);
        }
      }
      for (const entry of newEntries) {
        await nativeUpsertOne(entry);
        entries.set(entry.id, copyEntry(entry));
      }
    },

    async remove(ids) {
      for (const id of ids) {
        await db.delete(id);
        entries.delete(id);
      }
    },

    async similar(query: SimilarQuery) {
      const total = entries.size;
      if (total === 0) return [];

      // RuVector cannot filter by tenant/scope server-side (DEBT-007): overfetch and filter
      // here, growing k until either enough matches are found or every entry has been
      // considered. Correctness over speed, per the adapter contract.
      let k = Math.min(query.k, total);
      for (;;) {
        const raw = await db.search({ vector: Float32Array.from(query.vector), k });
        const matches: { id: string; score: number }[] = [];
        for (const hit of raw) {
          const entry = entries.get(hit.id);
          if (!entry) continue; // no provenance for this id; never disclose it
          if (entry.tenant !== query.tenant) continue;
          if (query.scopeIds && query.scopeIds.length > 0 && !query.scopeIds.includes(entry.scopeId)) continue;
          // RuVector's search score is a distance (0 = identical); convert to a similarity
          // score so higher = more similar, per the CognitiveIndex contract.
          matches.push({ id: hit.id, score: 1 / (1 + hit.score) });
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
      // RuVector has no truncate/destroy call (API_NOTES); delete every known id explicitly.
      for (const id of entries.keys()) await db.delete(id);
      entries.clear();
    },

    async close() {
      // RuVector's VectorDb has no close()/destroy() method; releasing the adapter map is all
      // there is to release.
      entries.clear();
    },
  };
}
