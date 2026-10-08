import type { CognitiveEntry, CognitiveFlag, CognitiveIndex, Embedder, SimilarQuery } from "@godspeedai/cognitive-api";

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function copyEntry(entry: CognitiveEntry): CognitiveEntry {
  return {
    ...entry,
    embedding: Float32Array.from(entry.embedding),
    relationships: entry.relationships.map((r) => ({ ...r })),
  };
}

/** Exact cosine similarity over an in-memory map. Flags: vector_search, graph_traversal (via relationships), temporal_search. */
export function createMemoryIndex(options: { readonly dimension: number; readonly id?: string }): CognitiveIndex {
  const dimension = options.dimension;
  const entries = new Map<string, CognitiveEntry>();
  const flags = new Set<CognitiveFlag>(["vector_search", "graph_traversal", "temporal_search"]);

  return {
    id: options.id ?? "memory",
    flags,
    dimension,

    async upsert(newEntries) {
      for (const entry of newEntries) {
        if (entry.embedding.length !== dimension) {
          throw new Error(`cognitive-memory: expected embedding of dimension ${dimension}, got ${entry.embedding.length}`);
        }
      }
      for (const entry of newEntries) entries.set(entry.id, copyEntry(entry));
    },

    async remove(ids) {
      for (const id of ids) entries.delete(id);
    },

    async similar(query: SimilarQuery) {
      const candidates = Array.from(entries.values()).filter((e) => {
        if (e.tenant !== query.tenant) return false;
        if (query.scopeIds && query.scopeIds.length > 0 && !query.scopeIds.includes(e.scopeId)) return false;
        return true;
      });
      return candidates
        .map((e) => ({ id: e.id, score: cosineSimilarity(query.vector, e.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, query.k);
    },

    async get(id) {
      const entry = entries.get(id);
      return entry ? copyEntry(entry) : undefined;
    },

    async related(id, { types, depth }) {
      if (!entries.has(id)) return [];
      const visited = new Set<string>([id]);
      const order: string[] = [];
      let frontier = [id];
      for (let level = 0; level < depth && frontier.length > 0; level++) {
        const next: string[] = [];
        for (const current of frontier) {
          const entry = entries.get(current);
          if (!entry) continue;
          for (const rel of entry.relationships) {
            if (types && !types.includes(rel.type)) continue;
            if (visited.has(rel.target)) continue;
            visited.add(rel.target);
            order.push(rel.target);
            next.push(rel.target);
          }
        }
        frontier = next;
      }
      return order;
    },

    async count() {
      return entries.size;
    },

    async clear() {
      entries.clear();
    },

    async close() {},
  };
}

/** Deterministic feature-hashing bag-of-words embedder (L2-normalized). Not semantic; for tests and offline fallback. */
export function hashingEmbedder(dimension: number): Embedder {
  return {
    id: "hashing",
    dimension,
    async embed(texts) {
      return texts.map((text) => hashText(text, dimension));
    },
  };
}

function fnv1a(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hashText(text: string, dimension: number): Float32Array {
  const vector = new Float32Array(dimension);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
  for (const token of tokens) {
    const hash = fnv1a(token);
    const bucket = (hash >>> 1) % dimension;
    const sign = hash & 1 ? 1 : -1;
    vector[bucket] = vector[bucket]! + sign;
  }
  let norm = 0;
  for (let i = 0; i < dimension; i++) norm += vector[i]! * vector[i]!;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimension; i++) vector[i] = vector[i]! / norm;
  }
  return vector;
}
