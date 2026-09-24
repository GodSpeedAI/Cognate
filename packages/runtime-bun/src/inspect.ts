// Causal identity reconstruction from committed envelopes (spec §33, §40.M). Uses only envelope fields and
// metadata, so it still works after payload erasure.
import type { ContinuationService } from "@cognate/continuations";
import type { DurableStore, Json, StoredEvent } from "@cognate/events";
import { field, meta } from "./fold.ts";
import type { CausalChain } from "./index.ts";

const PAGE = 1000;

export async function inspectCorrelation(store: DurableStore, continuations: ContinuationService, correlationId: string): Promise<CausalChain> {
  const matching: StoredEvent[] = [];
  for (let position = 0; ; ) {
    const page = await store.readAll({ afterPosition: position, limit: PAGE });
    for (const event of page) if (event.correlationId === correlationId) matching.push(event);
    if (page.length < PAGE) break;
    position = page.at(-1)!.position;
  }

  // Continuation envelopes do not carry the wait's semantic reference; the continuation record does.
  const continuationRefs = new Map<string, Json>();
  for (const event of matching) {
    if (!event.streamId.startsWith("continuation-") || continuationRefs.has(event.streamId)) continue;
    const record = await continuations.get(event.streamId.slice("continuation-".length));
    continuationRefs.set(event.streamId, (record?.semanticRef ?? null) as unknown as Json);
  }

  const runs: string[] = [];
  const invocations: { capability: string; providerId: string; fiberId: string; decision: Json }[] = [];
  const artifacts: string[] = [];
  const events = matching.map((event) => {
    const m = meta(event);
    if (event.eventType === "run.started" && event.runId) runs.push(event.runId);
    const providerId = field<string>(m, "providerId");
    if (event.eventType === "run.invocation" && providerId) {
      invocations.push({ capability: field<string>(m, "capability") ?? "", providerId, fiberId: event.fiberId ?? field<string>(m, "fiberId") ?? providerId, decision: field(m, "decision") });
    }
    const artifactId = field<string>(m, "artifactId");
    if (event.eventType === "run.artifact" && artifactId) artifacts.push(artifactId);
    const semanticRef = (event.semanticRef as unknown as Json | undefined) ?? continuationRefs.get(event.streamId) ?? null;
    return {
      eventId: event.eventId,
      eventType: event.eventType,
      causationId: event.causationId,
      ...(event.componentId ? { componentId: event.componentId } : {}),
      ...(event.fiberId ? { fiberId: event.fiberId } : {}),
      ...(semanticRef !== null ? { semanticRef } : {}),
    };
  });

  return { correlationId, runs, events, invocations, artifacts, observations: [] };
}
