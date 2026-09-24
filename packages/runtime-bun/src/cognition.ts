// Cognition wiring (spec §15, §16): an indexer projection over completed runs and an authorized recall path.
import { cognitiveIndexer, createRecall, type IndexDocument } from "@cognate/cognitive-api";
import type { DurableStore, Json, StoredEvent } from "@cognate/events";
import type { Principal } from "@cognate/kernel-api";
import type { Projection } from "@cognate/projections";
import type { RecallResultJson } from "./core.ts";
import { field, foldRun, meta, runStream } from "./fold.ts";
import type { CognitionOptions } from "./index.ts";

export const COGNITION_PROJECTION = { name: "runtime.cognition", version: "1" } as const;

/** Default extraction: one entry per completed run, routed back to the run by `run:<id>`; content stays in events. */
export function extractCompletedRun(event: StoredEvent): readonly IndexDocument[] {
  if (event.eventType !== "run.completed" || !event.runId || event.payload === null) return [];
  const agent = field<string>(meta(event), "agent") ?? "";
  return [
    {
      id: `run:${event.runId}`,
      sourceType: "run",
      sourceRef: `run:${event.runId}`,
      tenant: event.tenant,
      scopeId: event.scopeId,
      semanticRef: event.semanticRef ?? null,
      eventRef: event.eventId,
      traceRef: null,
      metadata: { agent, runId: event.runId },
      relationships: [],
      validFrom: event.recordedAt,
      validTo: null,
      text: `${agent} ${JSON.stringify(field(event.payload, "output"))}`,
    },
  ];
}

export function cognitionProjection(options: CognitionOptions): Projection {
  return cognitiveIndexer({ ...COGNITION_PROJECTION, index: options.index, embedder: options.embedder, extract: options.extract ?? extractCompletedRun });
}

type RecallFn = (query: { readonly text: string; readonly k: number; readonly actor: Principal; readonly tenant: string }) => Promise<RecallResultJson>;

/** Recall that dereferences `run:<id>` to the run's authoritative, tenant-checked view. */
export function recallFor(store: DurableStore, cognition: CognitionOptions | undefined): RecallFn {
  if (!cognition) return async () => ({ status: "degraded", items: [] });
  const recall = createRecall({
    index: cognition.index,
    embedder: cognition.embedder,
    resolver: {
      async resolve(sourceRef, _actor, tenant) {
        if (!sourceRef.startsWith("run:")) return { kind: "missing" };
        const runId = sourceRef.slice("run:".length);
        const view = foldRun(runId, await store.readStream(runStream(runId)));
        if (!view) return { kind: "missing" };
        if (view.tenant !== tenant) return { kind: "denied" };
        return { kind: "ok", value: { runId, agent: view.agent, status: view.status, input: view.input, output: view.output } as Json };
      },
    },
  });
  return async ({ text, k, actor, tenant }) => {
    try {
      const result = await recall.recall({ text, k, actor, tenant, scopeIds: [] });
      return { status: result.status, items: result.items.map((i) => ({ sourceRef: i.sourceRef, score: i.score, value: i.value })) };
    } catch {
      return { status: "degraded", items: [] };
    }
  };
}
