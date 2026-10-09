import type { Json, StoredEvent } from "@godspeedai/cognate-events";
import type { Projection, ProjectionState, ProjectionWrite } from "@godspeedai/cognate-projections";
import type { CognitiveEntry, CognitiveIndex, Embedder } from "./types.ts";

/** What to index for one event: text to embed plus entry fields (without the embedding). */
export type IndexDocument = Omit<CognitiveEntry, "embedding" | "indexerVersion" | "durable"> & { readonly text: string };

export interface IndexerOptions {
  readonly name: string;
  readonly version: string;
  readonly index: CognitiveIndex;
  readonly embedder: Embedder;
  /** Deterministic extraction; return [] to skip. Must not copy restricted content into metadata. */
  readonly extract: (event: StoredEvent) => readonly IndexDocument[];
}

/**
 * An external projection (spec §11) feeding a CognitiveIndex from durable events. Upserts are idempotent
 * by entry id, so at-least-once replay is safe; erased events remove their entries.
 */
export function cognitiveIndexer(options: IndexerOptions): Projection {
  // The source-event → entry-id map is projection state (key `event:<id>`), committed with the checkpoint,
  // so an erasure processed after a restart still finds the entries to remove (spec §32).
  const key = (eventId: string) => `event:${eventId}`;

  async function removeForEvent(eventId: string, state: ProjectionState): Promise<readonly ProjectionWrite[]> {
    const ids = state.get(key(eventId));
    if (Array.isArray(ids) && ids.length > 0) await options.index.remove(ids.filter((id): id is string => typeof id === "string"));
    return [{ key: key(eventId), value: null }];
  }

  return {
    name: options.name,
    version: options.version,

    async apply(event: StoredEvent, state: ProjectionState): Promise<readonly ProjectionWrite[]> {
      if (event.eventType === "erasure.recorded") {
        const payload = event.payload as { readonly eventId?: Json } | null;
        return payload && typeof payload.eventId === "string" ? removeForEvent(payload.eventId, state) : [];
      }
      // A replayed source event whose payload was already erased is never re-indexed.
      if (event.erasure) return removeForEvent(event.eventId, state);

      const docs = options.extract(event);
      if (docs.length === 0) return [];
      const vectors = await options.embedder.embed(docs.map((doc) => doc.text));
      const entries: CognitiveEntry[] = docs.map((doc, i) => {
        const { text: _text, ...rest } = doc;
        return { ...rest, embedding: vectors[i]!, indexerVersion: options.version, durable: true };
      });
      await options.index.upsert(entries);
      return [{ key: key(event.eventId), value: entries.map((entry) => entry.id) }];
    },
  };
}
