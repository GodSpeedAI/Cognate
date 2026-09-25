// AK-008 (spec §17, §37 Phase 0): the adaptive ranker is Cognate-owned UCB1 (SONA rejected, ADR-0005). It ranks only
// the supplied eligible set, explores providers with few observations, replays durable feedback deterministically,
// and falls back to deterministic ordering when unavailable.
import { describe, expect, test } from "bun:test";
import type { DurableStore } from "@cognate/events";
import { ProjectionRunner } from "@cognate/projections";
import { createMemoryStore } from "@cognate/store-memory";
import { compatibilityRule, createOutcomeRanker, createSelector, outcomeProjection, recordOutcome, recordSelection, type Candidate, type EligibilityRule, type SelectionRequest } from "../src/index.ts";

const ctx = { tenant: "tenant-a", scopeId: "root", correlationId: "corr", runId: "run" };
const contract = { id: "tool.search", version: "1.0.0" };
const candidates: Candidate[] = ["a", "b", "c"].map((providerId) => ({ providerId, contract }));
const request = (list: readonly Candidate[] = candidates): SelectionRequest => ({ requirement: { capability: "tool.search" }, candidates: list, principal: { id: "p", kind: "agent" }, tenant: "tenant-a" });
const notC: EligibilityRule = { id: "no-c", evaluate: (c) => ({ eligible: c.providerId !== "c", reason: c.providerId === "c" ? "excluded" : "ok" }) };

/** Commit `plays` outcomes for `provider`, the first `successes` of them successful. */
async function history(store: DurableStore, provider: string, plays: number, successes: number): Promise<void> {
  for (let i = 0; i < plays; i++) {
    const selectionId = `${provider}-${i}`;
    await recordSelection(store, { selectionId, requirement: { capability: "tool.search" }, candidates: [provider], eligible: [provider], filters: [], scores: [], selected: provider, ranker: null, fallback: null }, ctx);
    await recordOutcome(store, selectionId, { success: i < successes }, ctx);
  }
}

async function projected(setup: (store: DurableStore) => Promise<void>): Promise<DurableStore> {
  const store = createMemoryStore();
  await setup(store);
  await new ProjectionRunner(store, outcomeProjection()).catchUp();
  return store;
}

describe("adaptive ranker: UCB1 over durable outcomes (AK-008)", () => {
  test("ranks only the supplied eligible set, even when an ineligible provider has the best record", async () => {
    const store = await projected(async (s) => {
      await history(s, "c", 20, 20);
      await history(s, "a", 2, 0);
      await history(s, "b", 2, 1);
    });
    const seen: string[][] = [];
    const inner = createOutcomeRanker(store);
    const spy = { id: inner.id, rank: async (eligible: readonly Candidate[], r: SelectionRequest) => (seen.push(eligible.map((c) => c.providerId)), inner.rank(eligible, r)) };
    const decision = await createSelector({ rules: [compatibilityRule, notC], ranker: spy }).select(request());
    expect(seen).toEqual([["a", "b"]]);
    expect(decision.scores.map((s) => s.providerId).sort()).toEqual(["a", "b"]);
    expect(decision.selected).toBe("b");
  });

  test("untried providers are ranked first, ties broken by provider id", async () => {
    const store = await projected((s) => history(s, "a", 3, 3));
    const decision = await createSelector({ rules: [compatibilityRule], ranker: createOutcomeRanker(store) }).select(request());
    expect(decision.selected).toBe("b");
    expect(decision.fallback).toBeNull();
  });

  test("scores are successRate + sqrt(2 ln N / n) over the eligible providers", async () => {
    const store = await projected(async (s) => {
      await history(s, "a", 1, 0);
      await history(s, "b", 50, 30);
    });
    const scores = await createOutcomeRanker(store).rank(candidates.slice(0, 2), request());
    const n = 51;
    expect(scores).toEqual([
      { providerId: "a", score: 0 + Math.sqrt((2 * Math.log(n)) / 1) },
      { providerId: "b", score: 30 / 50 + Math.sqrt((2 * Math.log(n)) / 50) },
    ]);
    // A greedy success-rate ranker would pick b forever; UCB1 re-tries the under-observed provider.
    expect((await createSelector({ rules: [compatibilityRule], ranker: createOutcomeRanker(store) }).select(request(candidates.slice(0, 2)))).selected).toBe("a");
  });

  test("closed loop: converges on the better provider while still exploring the other", async () => {
    const store = createMemoryStore();
    const runner = new ProjectionRunner(store, outcomeProjection());
    let n = 0;
    const selector = createSelector({ rules: [compatibilityRule], ranker: createOutcomeRanker(store), ids: () => `loop-${++n}` });
    const successRate: Record<string, number> = { a: 0.3, b: 0.8 };
    const plays: Record<string, number> = { a: 0, b: 0 };
    for (let round = 0; round < 200; round++) {
      const decision = await selector.select(request(candidates.slice(0, 2)));
      const provider = decision.selected!;
      // Deterministic Bernoulli: the k-th play of a provider succeeds on a fixed pattern at its rate.
      const k = plays[provider] ?? 0;
      plays[provider] = k + 1;
      const success = (k % 10) < successRate[provider]! * 10;
      await recordSelection(store, decision, ctx);
      await recordOutcome(store, decision.selectionId, { success }, ctx);
      await runner.catchUp();
    }
    expect(plays.b).toBeGreaterThan(150);
    expect(plays.a).toBeGreaterThan(3);
  });

  test("replays durable feedback deterministically: projection reset + rebuild restores identical scores", async () => {
    const store = createMemoryStore();
    const runner = new ProjectionRunner(store, outcomeProjection());
    await history(store, "a", 7, 2);
    await history(store, "b", 4, 3);
    await runner.catchUp();
    const before = await createOutcomeRanker(store).rank(candidates, request());
    await store.resetProjection(outcomeProjection().name);
    await runner.rebuild();
    expect(await createOutcomeRanker(store).rank(candidates, request())).toEqual(before);
  });

  test("an unavailable ranker falls back to deterministic provider-id order", async () => {
    const store = await projected((s) => history(s, "b", 5, 5));
    const offline = new Proxy(store, {
      get: (target, key) => (key === "readProjection" ? async () => { throw new Error("projection offline"); } : Reflect.get(target, key)),
    });
    const decision = await createSelector({ rules: [compatibilityRule], ranker: createOutcomeRanker(offline) }).select(request());
    expect(decision.selected).toBe("a");
    expect(decision.fallback).toBe("ranker failed: projection offline");
  });
});
