// Example: cognitive-memory — index authoritative facts and recall them by semantic similarity.
// Docs: docs/cognition.md (ADR-0004; spec §16: embed -> similar -> authorize -> resolve).
import type { Principal } from "@godspeedai/kernel-api";
import { createRecall } from "@godspeedai/cognitive-api";
import { createMemoryIndex, hashingEmbedder } from "@godspeedai/cognitive-memory";

async function main() {
  const dimension = 64;
  const index = createMemoryIndex({ dimension });
  const embedder = hashingEmbedder(dimension);

  const facts = [
    { id: "case-1", sourceRef: "case:1", text: "duplicate payment refund requested by customer" },
    { id: "case-2", sourceRef: "case:2", text: "weather forecast for paris tomorrow" },
  ];
  const embeddings = await embedder.embed(facts.map((f) => f.text));
  await index.upsert(
    facts.map((fact, i) => ({
      id: fact.id,
      sourceType: "event" as const,
      sourceRef: fact.sourceRef,
      tenant: "tenant-a",
      scopeId: "root",
      semanticRef: null,
      eventRef: fact.id,
      traceRef: null,
      embedding: embeddings[i]!,
      metadata: { text: fact.text },
      relationships: [],
      validFrom: "2026-01-01T00:00:00Z",
      validTo: null,
      indexerVersion: "1",
      durable: true,
    })),
  );

  const authoritative = new Map(facts.map((f) => [f.sourceRef, f.text]));
  const actor: Principal = { id: "alice", kind: "user" };
  const recall = createRecall({
    index,
    embedder,
    resolver: { async resolve(sourceRef, requester) { return requester.id === "mallory" ? { kind: "denied" } : { kind: "ok", value: authoritative.get(sourceRef) ?? null }; } },
  });

  const result = await recall.recall({ text: "customer wants a refund for being charged twice", actor, tenant: "tenant-a", scopeIds: ["root"], k: 1 });
  if (result.status !== "ok") throw new Error(`expected an ok recall, got: ${JSON.stringify(result)}`);
  if (result.items[0]?.sourceRef !== "case:1") throw new Error(`expected the semantically closer refund case, got: ${JSON.stringify(result.items)}`);

  const denied = await recall.recall({ text: "duplicate payment refund", actor: { id: "mallory", kind: "user" }, tenant: "tenant-a", scopeIds: ["root"], k: 1 });
  if (denied.items.length !== 0) throw new Error(`expected denied access to drop the result, got: ${JSON.stringify(denied.items)}`);

  console.log(`ok: recall ranked the semantically related fact first (${result.items[0]!.sourceRef}) and dropped denied results`);
}

await main();
