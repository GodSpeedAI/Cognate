// CG-CAP-001: deterministic eligibility precedes ranking; the decision is explained and recorded (spec §8.2, §17, §30).
import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import type { Principal } from "@godspeedai/cognate-kernel-api";
import { compatibilityRule, createSelector, recordSelection, type Candidate, type EligibilityRule, type Ranker, type SelectionRequest } from "../src/index.ts";

const alice: Principal = { id: "alice", kind: "user" };
const model = (providerId: string, version = "1.0.0", attributes: Record<string, boolean | string> = { structured_output: true }): Candidate => ({ providerId, contract: { id: "model.generate", version, attributes } });
const request = (candidates: Candidate[]): SelectionRequest => ({ requirement: { capability: "model.generate", version: "1.0", attributes: { structured_output: true } }, candidates, principal: alice, tenant: "tenant-a", context: { task: "refund" } });
const noCloud: EligibilityRule = { id: "policy.no-cloud", evaluate: (c) => (c.contract.attributes?.hosting === "cloud" ? { eligible: false, reason: "tenant forbids cloud models" } : { eligible: true, reason: "hosting allowed" }) };
const ranker = (scores: Record<string, number>): Ranker => ({ id: "test-ranker", rank: async (eligible) => eligible.map((c) => ({ providerId: c.providerId, score: scores[c.providerId] ?? 0 })) });

describe("capability selection (§8.2)", () => {
  test("filters with every rule, ranks only eligible candidates, and explains the decision", async () => {
    const candidates = [model("cloud-a", "1.2.0", { structured_output: true, hosting: "cloud" }), model("local-b"), model("local-c"), model("old", "0.9.0"), model("plain", "1.0.0", {})];
    const seenByRanker: string[][] = [];
    const selector = createSelector({ rules: [compatibilityRule, noCloud], ranker: { id: "spy", rank: async (eligible) => (seenByRanker.push(eligible.map((c) => c.providerId)), eligible.map((c) => ({ providerId: c.providerId, score: c.providerId === "local-c" ? 0.9 : 0.1 }))) }, ids: () => "sel-1" });
    const decision = await selector.select(request(candidates));
    expect(decision.selectionId).toBe("sel-1");
    expect(decision.candidates).toEqual(["cloud-a", "local-b", "local-c", "old", "plain"]);
    expect(decision.eligible).toEqual(["local-b", "local-c"]);
    expect(seenByRanker).toEqual([["local-b", "local-c"]]);
    expect(decision.selected).toBe("local-c");
    expect(decision.ranker).toBe("spy");
    expect(decision.fallback).toBeNull();
    expect(decision.filters).toContainEqual({ providerId: "cloud-a", ruleId: "policy.no-cloud", eligible: false, reason: "tenant forbids cloud models" });
    expect(decision.filters.find((f) => f.providerId === "old" && f.ruleId === compatibilityRule.id)?.eligible).toBe(false);
    expect(decision.scores).toEqual([{ providerId: "local-b", score: 0.1 }, { providerId: "local-c", score: 0.9 }]);
  });

  test("without a ranker, selection is deterministic by provider id", async () => {
    const selector = createSelector({ rules: [compatibilityRule] });
    const decision = await selector.select(request([model("zeta"), model("alpha"), model("mid")]));
    expect(decision.selected).toBe("alpha");
    expect(decision.fallback).toBe("no ranker");
  });

  test("a ranker that throws, invents ids, or returns non-finite scores cannot select outside the eligible set", async () => {
    const throwing = createSelector({ rules: [compatibilityRule, noCloud], ranker: { id: "boom", rank: async () => { throw new Error("index offline"); } } });
    const t = await throwing.select(request([model("b"), model("a")]));
    expect(t).toMatchObject({ selected: "a", fallback: "ranker failed: index offline" });
    const inventing = createSelector({ rules: [compatibilityRule, noCloud], ranker: ranker({ ghost: 99, "cloud-a": 50, b: Number.NaN, a: 0.2 }) });
    const cloud = model("cloud-a", "1.0.0", { structured_output: true, hosting: "cloud" });
    const i = await inventing.select(request([cloud, model("a"), model("b")]));
    expect(i.selected).toBe("a");
    expect(i.scores.map((s) => s.providerId)).not.toContain("ghost");
    expect(i.scores.map((s) => s.providerId)).not.toContain("cloud-a");
  });

  test("no eligible candidate selects nothing and never calls the ranker", async () => {
    let called = false;
    const selector = createSelector({ rules: [compatibilityRule], ranker: { id: "r", rank: async () => ((called = true), []) } });
    const decision = await selector.select(request([model("old", "0.1.0")]));
    expect(decision.selected).toBeNull();
    expect(decision.eligible).toEqual([]);
    expect(called).toBe(false);
  });

  test("the decision is recorded as a durable fact with its full explanation", async () => {
    const store = createMemoryStore();
    const decision = await createSelector({ rules: [compatibilityRule], ranker: ranker({ a: 1 }), ids: () => "sel-9" }).select(request([model("a"), model("b")]));
    await recordSelection(store, decision, { tenant: "tenant-a", scopeId: "root", correlationId: "corr-1", runId: "run-1" });
    const [recorded] = await store.readStream("selection-sel-9");
    expect(recorded).toMatchObject({ eventType: "capability.selected", runId: "run-1", payload: { selectionId: "sel-9", selected: "a", eligible: ["a", "b"], candidates: ["a", "b"] } });
    expect((recorded!.payload as { filters: unknown[] }).filters.length).toBe(2);
  });
});
