// cognitiveIndexer: feeds a CognitiveIndex from durable events via ProjectionRunner; rebuildable; erasure-aware (spec §11, §32).
import { describe, expect, test } from "bun:test";
import type { Json, StoredEvent } from "@godspeedai/events";
import { createMemoryStore } from "@godspeedai/store-memory";
import { ProjectionRunner } from "@godspeedai/projections";
import { createMemoryIndex, hashingEmbedder } from "@godspeedai/cognitive-memory";
import { cognitiveIndexer, type IndexDocument } from "../src/indexer.ts";

function extract(event: StoredEvent): readonly IndexDocument[] {
  if (event.eventType !== "doc.created" || event.payload === null) return [];
  const payload = event.payload as { readonly text: string };
  return [
    {
      id: event.eventId,
      sourceType: "event",
      sourceRef: `event:${event.eventId}`,
      tenant: event.tenant,
      scopeId: event.scopeId,
      semanticRef: null,
      eventRef: event.eventId,
      traceRef: null,
      metadata: {},
      relationships: [],
      validFrom: event.recordedAt,
      validTo: null,
      text: payload.text,
    },
  ];
}

async function setup() {
  const store = createMemoryStore();
  const index = createMemoryIndex({ dimension: 16 });
  const embedder = hashingEmbedder(16);
  const indexer = cognitiveIndexer({ name: "cog-index-test", version: "1", index, embedder, extract });
  const runner = new ProjectionRunner(store, indexer);
  return { store, index, embedder, runner };
}

const doc = (text: string): { eventType: string; schemaVersion: number; occurredAt: string; tenant: string; correlationId: string; causationId: null; runId: null; scopeId: string; payload: Json } => ({
  eventType: "doc.created",
  schemaVersion: 1,
  occurredAt: "2026-09-24T00:00:00.000Z",
  tenant: "tenant-a",
  correlationId: "corr-1",
  causationId: null,
  runId: null,
  scopeId: "root",
  payload: { text },
});

describe("cognitiveIndexer (spec §11, §32)", () => {
  test("indexes documents through ProjectionRunner and answers similarity queries", async () => {
    const { store, index, embedder, runner } = await setup();
    await store.commit({ appends: [{ streamId: "docs", expectedVersion: 0, events: [doc("duplicate payment refund"), doc("weather in paris")] }] });

    const result = await runner.catchUp();
    expect(result.status).toBe("ok");
    expect(await index.count()).toBe(2);

    const [vector] = await embedder.embed(["duplicate payment refund"]);
    const hits = await index.similar({ vector: vector!, k: 1, tenant: "tenant-a" });
    expect(hits).toHaveLength(1);
    const top = await index.get(hits[0]!.id);
    expect(top?.metadata).toEqual({});
  });

  test("rebuild after index.clear() restores identical similar results", async () => {
    const { store, index, embedder, runner } = await setup();
    await store.commit({ appends: [{ streamId: "docs", expectedVersion: 0, events: [doc("duplicate payment refund"), doc("weather in paris")] }] });
    await runner.catchUp();

    const [vector] = await embedder.embed(["duplicate payment refund"]);
    const before = await index.similar({ vector: vector!, k: 2, tenant: "tenant-a" });

    await index.clear();
    expect(await index.count()).toBe(0);
    const rebuilt = await runner.rebuild();
    expect(rebuilt.status).toBe("ok");

    const after = await index.similar({ vector: vector!, k: 2, tenant: "tenant-a" });
    expect(after).toEqual(before);
  });

  test("erasure removes the entry for the erased event", async () => {
    const { store, index, runner } = await setup();
    const { events } = await store.commit({ appends: [{ streamId: "docs", expectedVersion: 0, events: [doc("duplicate payment refund")] }] });
    const eventId = events[0]!.eventId;
    await runner.catchUp();
    expect(await index.get(eventId)).toBeDefined();

    await store.erasePayload(eventId, "gdpr-art-17", "operator-1");
    const result = await runner.catchUp();
    expect(result.status).toBe("ok");
    expect(await index.get(eventId)).toBeUndefined();
    expect(await index.count()).toBe(0);
  });
});

describe("cognitiveIndexer across restarts (§32)", () => {
  test("an erasure processed by a fresh indexer instance (process restart) still removes the erased event's entries", async () => {
    const store = createMemoryStore();
    const index = createMemoryIndex({ dimension: 16 });
    const embedder = hashingEmbedder(16);
    const make = () => new ProjectionRunner(store, cognitiveIndexer({ name: "cog-restart", version: "1", index, embedder, extract }));
    const { events } = await store.commit({ appends: [{ streamId: "docs", expectedVersion: 0, events: [doc("private medical note"), doc("public faq")] }] });
    await make().catchUp();
    expect(await index.count()).toBe(2);
    await store.erasePayload(events[0]!.eventId, "gdpr", "operator");
    // A new runner and indexer, as after a restart: no in-memory state from the first run.
    await make().catchUp();
    expect(await index.get(events[0]!.eventId)).toBeUndefined();
    expect(await index.count()).toBe(1);
  });
});
