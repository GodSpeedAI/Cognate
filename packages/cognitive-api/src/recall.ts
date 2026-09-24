import type { Embedder, CognitiveIndex, RecallItem, RecallQuery, RecallResult, SourceResolver } from "./types.ts";

export class CognitionUnavailableError extends Error {
  override readonly name = "CognitionUnavailableError";
}

export interface RecallOptions {
  readonly index: CognitiveIndex;
  readonly embedder: Embedder;
  readonly resolver: SourceResolver;
  /** Candidates fetched per requested item before filtering (default 4). */
  readonly overfetch?: number;
}

/**
 * The standard retrieval path (spec §16): embed → similar (tenant/scope pre-filter where supported) →
 * scope post-filter on entry provenance → authorized authoritative fetch → consumer.
 * Denied or missing sources are dropped without disclosure; results never exceed `k`.
 */
export function createRecall(options: RecallOptions): { recall(query: RecallQuery): Promise<RecallResult> } {
  const overfetch = options.overfetch ?? 4;
  return {
    async recall(query: RecallQuery): Promise<RecallResult> {
      let hits: readonly { readonly id: string; readonly score: number }[];
      try {
        const [vector] = await options.embedder.embed([query.text]);
        hits = await options.index.similar({
          vector: vector!,
          k: query.k * overfetch,
          tenant: query.tenant,
          scopeIds: query.scopeIds,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (query.required) throw new CognitionUnavailableError(message);
        return { status: "degraded", items: [], reason: message };
      }

      const items: RecallItem[] = [];
      for (const hit of hits) {
        if (items.length >= query.k) break;
        const entry = await options.index.get(hit.id);
        if (!entry) continue;
        if (entry.tenant !== query.tenant) continue;
        if (query.scopeIds.length > 0 && !query.scopeIds.includes(entry.scopeId)) continue;
        const resolution = await options.resolver.resolve(entry.sourceRef, query.actor, query.tenant);
        if (resolution.kind !== "ok") continue;
        items.push({
          sourceRef: entry.sourceRef,
          sourceType: entry.sourceType,
          score: hit.score,
          value: resolution.value,
          semanticRef: entry.semanticRef,
        });
      }
      return { status: "ok", items };
    },
  };
}
