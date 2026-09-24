// CognitiveIndex conformance kit. Every index implementation must pass it unchanged.
import { afterEach, describe, expect, test } from "bun:test";
import type { CognitiveEntry, CognitiveIndex } from "./types.ts";

export function entry(id: string, vector: number[], overrides: Partial<CognitiveEntry> = {}): CognitiveEntry {
  return {
    id,
    sourceType: "event",
    sourceRef: `event:${id}`,
    tenant: "tenant-a",
    scopeId: "root",
    semanticRef: null,
    eventRef: id,
    traceRef: null,
    embedding: Float32Array.from(vector),
    metadata: { kind: "test" },
    relationships: [],
    validFrom: "2026-09-24T00:00:00.000Z",
    validTo: null,
    indexerVersion: "1",
    durable: true,
    ...overrides,
  };
}

/** `make` returns a fresh, empty index of dimension 4. */
export function cognitiveIndexConformance(name: string, make: () => Promise<CognitiveIndex>): void {
  describe(`${name}: CognitiveIndex conformance (§14)`, () => {
    const open: CognitiveIndex[] = [];
    afterEach(async () => {
      for (const index of open.splice(0)) await index.close();
    });
    const fresh = async () => {
      const index = await make();
      open.push(index);
      return index;
    };

    test("declares vector_search and its dimension", async () => {
      const index = await fresh();
      expect(index.flags.has("vector_search")).toBe(true);
      expect(index.dimension).toBe(4);
      expect(index.related === undefined).toBe(!index.flags.has("graph_traversal"));
    });

    test("similar returns nearest ids first", async () => {
      const index = await fresh();
      await index.upsert([entry("north", [1, 0, 0, 0]), entry("east", [0, 1, 0, 0]), entry("north-east", [0.7, 0.7, 0, 0])]);
      const hits = await index.similar({ vector: Float32Array.from([0.9, 0.1, 0, 0]), k: 2, tenant: "tenant-a" });
      expect(hits.map((h) => h.id)).toEqual(["north", "north-east"]);
      expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score);
    });

    test("upsert is idempotent by id and replaces the entry", async () => {
      const index = await fresh();
      await index.upsert([entry("a", [1, 0, 0, 0])]);
      await index.upsert([entry("a", [0, 0, 1, 0], { metadata: { kind: "updated" } })]);
      expect(await index.count()).toBe(1);
      expect((await index.get("a"))!.metadata).toEqual({ kind: "updated" });
      expect((await index.similar({ vector: Float32Array.from([0, 0, 1, 0]), k: 1, tenant: "tenant-a" }))[0]!.id).toBe("a");
    });

    test("get preserves provenance fields", async () => {
      const index = await fresh();
      const semanticRef = { namespace: "billing", id: "billing::Refund", source: { uri: "file:///b.sea", digest: "sha256:1" }, projectionVersion: "1" };
      await index.upsert([entry("p", [0, 1, 0, 0], { sourceType: "artifact", sourceRef: "artifact:x", semanticRef, traceRef: "sxr:7", scopeId: "ws", relationships: [{ type: "about", target: "q" }] })]);
      expect(await index.get("p")).toMatchObject({ sourceType: "artifact", sourceRef: "artifact:x", semanticRef, traceRef: "sxr:7", scopeId: "ws", tenant: "tenant-a", indexerVersion: "1", durable: true, relationships: [{ type: "about", target: "q" }] });
      expect(Array.from((await index.get("p"))!.embedding)).toEqual([0, 1, 0, 0]);
    });

    test("remove and clear delete derived entries", async () => {
      const index = await fresh();
      await index.upsert([entry("a", [1, 0, 0, 0]), entry("b", [0, 1, 0, 0])]);
      await index.remove(["a"]);
      expect(await index.get("a")).toBeUndefined();
      expect(await index.count()).toBe(1);
      await index.clear();
      expect(await index.count()).toBe(0);
      expect(await index.similar({ vector: Float32Array.from([0, 1, 0, 0]), k: 5, tenant: "tenant-a" })).toEqual([]);
    });

    test("similar never returns another tenant's entries", async () => {
      const index = await fresh();
      await index.upsert([entry("mine", [0.5, 0.5, 0, 0]), entry("theirs", [1, 0, 0, 0], { tenant: "tenant-b" })]);
      const hits = await index.similar({ vector: Float32Array.from([1, 0, 0, 0]), k: 5, tenant: "tenant-a" });
      expect(hits.map((h) => h.id)).toEqual(["mine"]);
    });

    test("scope restriction excludes other scopes when given", async () => {
      const index = await fresh();
      await index.upsert([entry("ws1", [1, 0, 0, 0], { scopeId: "ws1" }), entry("ws2", [1, 0, 0, 0], { scopeId: "ws2" })]);
      const hits = await index.similar({ vector: Float32Array.from([1, 0, 0, 0]), k: 5, tenant: "tenant-a", scopeIds: ["ws2"] });
      expect(hits.map((h) => h.id)).toEqual(["ws2"]);
    });

    test("rejects vectors of the wrong dimension", async () => {
      const index = await fresh();
      await expect(index.upsert([entry("bad", [1, 0, 0])])).rejects.toThrow();
    });
  });
}
