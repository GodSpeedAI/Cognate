// Ranker bridge conformance: the judgment-backed ranker must never widen the eligible set,
// never reintroduce a deterministically eliminated candidate, treat abstention and malformed
// answers as "no ranking", and eliminate in repeated small groups before a final shortlist
// judgment (decision-tree/shortlist pattern for small-world agent reasoning).
import { describe, expect, test } from "bun:test";
import { typeSafeRanker, typeSafeDirectRanker } from "../src/ranker.ts";
import { createSelector } from "@godspeedai/cognate-capabilities";
import type { JudgmentProvider, JudgmentRequest, JudgmentResponse } from "@godspeedai/cognate-capabilities";
import type { Candidate, SelectionRequest } from "@godspeedai/cognate-capabilities";

const candidate = (id: string): Candidate => ({ providerId: id, contract: { id: "model.generate", version: "1.0.0", attributes: { model: id } } });
const request: SelectionRequest = {
  requirement: { capability: "model.generate" },
  candidates: [],
  principal: { id: "op", kind: "user" },
  tenant: "local",
};

/** Scripted judgment provider: answers the active question from a queue, records every call. */
function scripted(responder: (question: JudgmentRequest) => JudgmentResponse["answers"]) {
  const calls: JudgmentRequest[] = [];
  const provider: JudgmentProvider = {
    id: "scripted",
    model: "jev-test",
    async evaluate(request) {
      calls.push(request);
      return { model: "jev-test", answers: responder(request) };
    },
  };
  return { provider, calls };
}

const choiceAnswer = (id: string): JudgmentResponse["answers"] => ({ selection: { type: "choice", choice: id, confidence: 0.9 } });
const scoreAnswer = (score: number): JudgmentResponse["answers"] => ({ fit: { type: "score", score } });

describe("typeSafeRanker (tournament)", () => {
  test("empty and single candidate sets never call the judge", async () => {
    const { provider, calls } = scripted(() => choiceAnswer("a"));
    const ranker = typeSafeRanker(provider);
    expect(await ranker.rank([], request)).toEqual([]);
    expect(await ranker.rank([candidate("solo")], request)).toEqual([{ providerId: "solo", score: 1 }]);
    expect(calls).toHaveLength(0);
  });

  test("a shortlist is judged as a whole; the winner leads and the rest follow deterministically", async () => {
    const { provider, calls } = scripted(() => choiceAnswer("b"));
    const ranker = typeSafeRanker(provider, { shortlistSize: 3, groupSize: 4 });
    const ranked = await ranker.rank(["a", "b", "c"].map(candidate), request);
    expect(ranked[0]).toEqual({ providerId: "b", score: 1 });
    expect(ranked.map((r) => r.providerId)).toEqual(["b", "a", "c"]);
    expect(calls).toHaveLength(1);
  });

  test("larger sets eliminate in groups first; a group winner cannot be an eliminated candidate", async () => {
    // Group 1 (a,b,c,d) -> winner c; group 2 (e,f,g,h) -> winner f; shortlist (c,f) -> winner f.
    const { provider, calls } = scripted((request) => {
      const question = request.questions.selection!;
      const options = question.type === "choice" ? Object.keys(question.criteria) : [];
      return options.includes("f") ? choiceAnswer("f") : choiceAnswer("c");
    });
    const ranker = typeSafeRanker(provider, { groupSize: 4, shortlistSize: 2 });
    const ranked = await ranker.rank(["a", "b", "c", "d", "e", "f", "g", "h"].map(candidate), request);
    expect(ranked[0]?.providerId).toBe("f");
    // Group heats (2) + shortlist final (1).
    expect(calls).toHaveLength(3);
  });

  test("an out-of-set choice (eliminated candidate) is treated as no ranking, never a reintroduction", async () => {
    // The judge answers with "z", which was never presented.
    const { provider } = scripted(() => choiceAnswer("z"));
    const ranker = typeSafeRanker(provider);
    expect(await ranker.rank(["a", "b"].map(candidate), request)).toEqual([]);
  });

  test("abstention (noul) and malformed answers yield an empty ranking, never a widened set", async () => {
    const abstaining = scripted(() => ({ selection: { type: "noul", noul: 0.5 } }));
    expect(await typeSafeRanker(abstaining.provider).rank(["a", "b"].map(candidate), request)).toEqual([]);
    // A raw provider mock handing back a non-string choice: the adapter treats it as no ranking.
    const malformed = scripted(() => ({ selection: { type: "choice", choice: 42 as never } }));
    expect(await typeSafeRanker(malformed.provider).rank(["a", "b"].map(candidate), request)).toEqual([]);
    // A choice naming a candidate outside the presented set is equally inert.
    const foreign = scripted(() => choiceAnswer("z"));
    expect(await typeSafeRanker(foreign.provider).rank(["a", "b"].map(candidate), request)).toEqual([]);
  });

  test("judge failure propagates so the selector falls back deterministically", async () => {
    const provider: JudgmentProvider = { id: "broken", model: "m", evaluate: async () => { throw new Error("upstream down"); } };
    const ranker = typeSafeRanker(provider);
    const selector = createSelector({ rules: [], ranker });
    const decision = await selector.select({ ...request, candidates: ["b", "a"].map(candidate) });
    expect(decision.selected).toBe("a"); // lexicographic fallback
    expect(decision.fallback).toContain("upstream down");
    expect(decision.ranker).toContain("typesafe-ranker");
  });

  test("end-to-end through the selector: ranked winner is selected and every id in scores was eligible", async () => {
    const { provider } = scripted(() => choiceAnswer("b"));
    const selector = createSelector({ rules: [], ranker: typeSafeRanker(provider) });
    const decision = await selector.select({ ...request, candidates: ["a", "b", "c"].map(candidate) });
    expect(decision.selected).toBe("b");
    expect(decision.eligible).toEqual(["a", "b", "c"]);
    for (const score of decision.scores) expect(decision.eligible).toContain(score.providerId);
  });
});

describe("typeSafeDirectRanker (per-candidate scores)", () => {
  test("scores each candidate once and skips invalid or abstaining scores", async () => {
    let n = 0;
    const { provider, calls } = scripted(() => {
      n += 1;
      if (n === 2) return { fit: { type: "noul", noul: 0.9 } }; // abstain on the second candidate
      return scoreAnswer(n === 1 ? 3 : 1);
    });
    const ranked = await typeSafeDirectRanker(provider).rank(["a", "b", "c"].map(candidate), request);
    expect(calls).toHaveLength(3);
    expect(ranked).toEqual([{ providerId: "a", score: 3 }, { providerId: "c", score: 1 }]);
  });
});
