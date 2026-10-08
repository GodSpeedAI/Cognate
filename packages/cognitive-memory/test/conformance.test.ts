import { cognitiveIndexConformance } from "@godspeedai/cognitive-api/conformance";
import { describe, expect, test } from "bun:test";
import { createMemoryIndex, hashingEmbedder } from "../src/index.ts";

cognitiveIndexConformance("cognitive-memory", async () => createMemoryIndex({ dimension: 4 }));

describe("hashing embedder", () => {
  test("is deterministic, normalized, and places shared-word texts closer", async () => {
    const embedder = hashingEmbedder(64);
    const [a, b, c, a2] = await embedder.embed(["duplicate payment refund", "refund duplicate charge", "weather in paris", "duplicate payment refund"]);
    const dot = (x: Float32Array, y: Float32Array) => x.reduce((s, v, i) => s + v * y[i]!, 0);
    expect(Array.from(a!)).toEqual(Array.from(a2!));
    expect(dot(a!, a!)).toBeCloseTo(1, 5);
    expect(dot(a!, b!)).toBeGreaterThan(dot(a!, c!));
  });
});

describe("memory index graph traversal", () => {
  test("related follows relationship edges to the requested depth", async () => {
    const index = createMemoryIndex({ dimension: 2 });
    const base = { sourceType: "event" as const, tenant: "t", scopeId: "root", semanticRef: null, eventRef: null, traceRef: null, metadata: {}, validFrom: "2026-01-01T00:00:00Z", validTo: null, indexerVersion: "1", durable: true, embedding: Float32Array.from([1, 0]) };
    await index.upsert([
      { ...base, id: "case", sourceRef: "event:case", relationships: [{ type: "resolved_by", target: "tool" }] },
      { ...base, id: "tool", sourceRef: "event:tool", relationships: [{ type: "produced", target: "artifact" }] },
      { ...base, id: "artifact", sourceRef: "artifact:1", relationships: [] },
    ]);
    expect(await index.related!("case", { depth: 1 })).toEqual(["tool"]);
    expect(await index.related!("case", { depth: 2 })).toEqual(["tool", "artifact"]);
    expect(await index.related!("case", { depth: 2, types: ["resolved_by"] })).toEqual(["tool"]);
  });
});
