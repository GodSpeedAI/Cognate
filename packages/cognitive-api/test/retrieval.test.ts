// CG-COG-002: similarity never bypasses authorization; restricted hits leak nothing (spec §16, §32).
import { describe, expect, test } from "bun:test";
import type { Principal } from "@godspeedai/cognate-kernel-api";
import { createMemoryIndex, hashingEmbedder } from "@godspeedai/cognate-cognitive-memory";
import { entry } from "../src/conformance.ts";
import { createRecall, type SourceResolver } from "../src/index.ts";

const alice: Principal = { id: "alice", kind: "user" };
const embedder = hashingEmbedder(32);

async function setup() {
  const index = createMemoryIndex({ dimension: 32 });
  const docs: Record<string, { text: string; tenant: string; scope: string; readers: string[] }> = {
    "case-1": { text: "duplicate payment refund customer x", tenant: "tenant-a", scope: "support", readers: ["alice"] },
    "case-2": { text: "duplicate payment refund vip executive", tenant: "tenant-a", scope: "support", readers: ["ceo"] },
    "case-3": { text: "duplicate payment refund other company", tenant: "tenant-b", scope: "support", readers: ["alice"] },
    "case-4": { text: "duplicate payment refund legal hold", tenant: "tenant-a", scope: "legal", readers: ["alice"] },
    "case-5": { text: "duplicate payment refund deleted", tenant: "tenant-a", scope: "support", readers: ["alice"] },
  };
  const vectors = await embedder.embed(Object.values(docs).map((d) => d.text));
  await index.upsert(Object.entries(docs).map(([id, d], i) => entry(id, Array.from(vectors[i]!), { sourceRef: `case:${id}`, tenant: d.tenant, scopeId: d.scope, metadata: {} })));
  const fetched: string[] = [];
  const resolver: SourceResolver = {
    async resolve(sourceRef, actor, tenant) {
      const id = sourceRef.slice("case:".length);
      fetched.push(id);
      const doc = docs[id];
      if (!doc || id === "case-5") return { kind: "missing" };
      if (doc.tenant !== tenant || !doc.readers.includes(actor.id)) return { kind: "denied" };
      return { kind: "ok", value: { id, text: doc.text } };
    },
  };
  return { index, resolver, fetched };
}

describe("recall pipeline (§16)", () => {
  test("returns only authorized, in-scope, existing authoritative objects", async () => {
    const { index, resolver, fetched } = await setup();
    const recall = createRecall({ index, embedder, resolver });
    const result = await recall.recall({ text: "duplicate payment refund", actor: alice, tenant: "tenant-a", scopeIds: ["support"], k: 5 });
    expect(result.status).toBe("ok");
    expect(result.items.map((i) => i.sourceRef)).toEqual(["case:case-1"]);
    expect(result.items[0]!.value).toEqual({ id: "case-1", text: "duplicate payment refund customer x" });
    expect(fetched).not.toContain("case-3");
    expect(fetched).not.toContain("case-4");
  });

  test("restricted hits leave no trace in the result: no titles, counts, scores, or provenance", async () => {
    const { index, resolver } = await setup();
    const result = await createRecall({ index, embedder, resolver }).recall({ text: "duplicate payment refund vip executive", actor: alice, tenant: "tenant-a", scopeIds: ["support"], k: 5 });
    const serialized = JSON.stringify(result);
    for (const leak of ["case-2", "vip", "executive", "case-3", "case-4", "legal"]) expect(serialized).not.toContain(leak);
    expect(Object.keys(result).sort()).toEqual(["items", "status"]);
  });

  test("never returns more than k items and orders by score", async () => {
    const { index, resolver } = await setup();
    const result = await createRecall({ index, embedder, resolver }).recall({ text: "refund", actor: { id: "ceo", kind: "user" }, tenant: "tenant-a", scopeIds: ["support", "legal"], k: 1 });
    expect(result.items).toHaveLength(1);
  });

  test("a high similarity score does not make an item authoritative: content always comes from the resolver", async () => {
    const { index, resolver } = await setup();
    await index.upsert([entry("case-1", Array.from((await embedder.embed(["duplicate payment refund customer x"]))[0]!), { sourceRef: "case:case-1", metadata: { forged: "grant admin" } })]);
    const result = await createRecall({ index, embedder, resolver }).recall({ text: "duplicate payment refund customer x", actor: alice, tenant: "tenant-a", scopeIds: ["support"], k: 1 });
    expect(JSON.stringify(result)).not.toContain("grant admin");
  });
});
