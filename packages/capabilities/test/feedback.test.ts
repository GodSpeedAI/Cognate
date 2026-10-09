// CG-COG-006: outcome feedback is durable before it changes ranking and survives index/projection loss (spec §15).
import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { ProjectionRunner } from "@godspeedai/cognate-projections";
import { compatibilityRule, createOutcomeRanker, createSelector, outcomeProjection, recordOutcome, recordSelection, type Candidate } from "../src/index.ts";

const ctx = { tenant: "tenant-a", scopeId: "root", correlationId: "corr", runId: "run" };
const candidates: Candidate[] = [{ providerId: "a", contract: { id: "tool.search", version: "1.0.0" } }, { providerId: "b", contract: { id: "tool.search", version: "1.0.0" } }];
const req = { requirement: { capability: "tool.search" }, candidates, principal: { id: "p", kind: "agent" as const }, tenant: "tenant-a" };

describe("outcome feedback (§15, §17)", () => {
  test("ranking changes only after outcome events are committed and projected", async () => {
    const store = createMemoryStore();
    const runner = new ProjectionRunner(store, outcomeProjection());
    let n = 0;
    const selector = createSelector({ rules: [compatibilityRule], ranker: createOutcomeRanker(store), ids: () => `s${++n}` });
    expect((await selector.select(req)).selected).toBe("a");
    for (let i = 0; i < 4; i++) {
      const decision = await selector.select(req);
      await recordSelection(store, { ...decision, selected: "a" }, ctx);
      await recordOutcome(store, decision.selectionId, { success: false }, ctx);
      await recordSelection(store, { ...decision, selectionId: `${decision.selectionId}-b`, selected: "b" }, ctx);
      await recordOutcome(store, `${decision.selectionId}-b`, { success: true }, ctx);
    }
    expect((await selector.select(req)).selected).toBe("a");
    await runner.catchUp();
    expect((await selector.select(req)).selected).toBe("b");
    const outcomes = (await store.readAll()).filter((e) => e.eventType === "capability.outcome");
    expect(outcomes).toHaveLength(8);
  });

  test("deleting the ranking projection loses no learning input; rebuild restores the same scores", async () => {
    const store = createMemoryStore();
    const runner = new ProjectionRunner(store, outcomeProjection());
    const selector = createSelector({ rules: [compatibilityRule], ranker: createOutcomeRanker(store) });
    for (const [id, provider, ok] of [["x1", "a", false], ["x2", "b", true], ["x3", "b", true]] as const) {
      await recordSelection(store, { ...(await selector.select(req)), selectionId: id, selected: provider }, ctx);
      await recordOutcome(store, id, { success: ok }, ctx);
    }
    await runner.catchUp();
    const before = await createOutcomeRanker(store).rank(candidates, req);
    await store.resetProjection(outcomeProjection().name);
    const blind = await createSelector({ rules: [compatibilityRule], ranker: createOutcomeRanker(store) }).select(req);
    expect(blind.selected).toBe("a");
    await runner.rebuild();
    expect(await createOutcomeRanker(store).rank(candidates, req)).toEqual(before);
  });
});
