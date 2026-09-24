// CG-COG-005: an unavailable index degrades to deterministic behaviour unless cognition is required (spec §31.3).
import { describe, expect, test } from "bun:test";
import { hashingEmbedder } from "@cognate/cognitive-memory";
import { CognitionUnavailableError, createRecall, type CognitiveIndex } from "../src/index.ts";

const broken: CognitiveIndex = {
  id: "broken",
  flags: new Set(["vector_search"]),
  dimension: 16,
  upsert: async () => { throw new Error("native binding crashed"); },
  remove: async () => { throw new Error("native binding crashed"); },
  similar: async () => { throw new Error("native binding crashed"); },
  get: async () => undefined,
  count: async () => { throw new Error("native binding crashed"); },
  clear: async () => {},
  close: async () => {},
};
const resolver = { resolve: async () => ({ kind: "missing" as const }) };
const query = { text: "anything", actor: { id: "a", kind: "user" as const }, tenant: "t", scopeIds: ["root"], k: 3 };

describe("cognitive fallback (§31.3)", () => {
  test("recall degrades to an empty, explained result instead of failing the caller", async () => {
    const result = await createRecall({ index: broken, embedder: hashingEmbedder(16), resolver }).recall(query);
    expect(result).toEqual({ status: "degraded", items: [], reason: "native binding crashed" });
  });

  test("a caller that declares cognition required gets a typed error", async () => {
    await expect(createRecall({ index: broken, embedder: hashingEmbedder(16), resolver }).recall({ ...query, required: true })).rejects.toBeInstanceOf(CognitionUnavailableError);
  });
});
