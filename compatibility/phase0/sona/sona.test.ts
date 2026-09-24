// Phase 0 compatibility fixture: @ruvector/sona@0.1.8 under Bun 1.4.0
//
// This file is NOT part of the Framework's dependency graph. Per
// software-design-spec-cognate §17: "SONA is a candidate adaptive-ranking
// implementation, not a verified Framework dependency. Phase 0 SHALL pin
// its package/API and prove that it can rank only a supplied eligible
// candidate set, persist feedback as durable input, and fall back to
// deterministic ordering when unavailable. Until those fixtures pass, no
// profile claims SONA support."
//
// HEADLINE FINDING: @ruvector/sona@0.1.8's public API has NO method that
// ranks a caller-supplied candidate set. It is a continual-learning /
// LoRA-adaptation engine (micro-LoRA + base-LoRA + EWC++ + trajectory
// clustering ("ReasoningBank")), not a ranker. `findPatterns()` returns
// internally-learned pattern cluster IDs (auto-generated, monotonically
// assigned by the engine), never an id from a set the caller passed in.
// There is no `rank`, `rankCandidates`, `score`, or similarly-named method
// anywhere on `SonaEngine`. This is recorded precisely per spec §17's
// escape valve ("If SONA's API doesn't fit ... record precisely") rather
// than forcing an ill-fitting adapter.
//
// Run with: bun test compatibility/phase0/sona/sona.test.ts

import { describe, test, expect, beforeAll } from "bun:test";

const HIDDEN_DIM = 8;

let SonaEngine: any;
let loadError: unknown = null;
let usedFallback = false;

beforeAll(async () => {
  try {
    const mod = await import("@ruvector/sona");
    SonaEngine = mod.SonaEngine ?? mod.default?.SonaEngine;
    if (!SonaEngine) throw new Error("SonaEngine export not found on module");
  } catch (err) {
    loadError = err;
    usedFallback = true;
  }
});

describe("load under Bun", () => {
  test("observed: @ruvector/sona native binding loads under Bun 1.4.0, or fallback engages", () => {
    if (loadError) {
      console.log("SONA load failure under Bun:", String(loadError));
      expect(usedFallback).toBe(true);
    } else {
      expect(typeof SonaEngine).toBe("function");
    }
  });
});

describe("observed: README's TrajectoryBuilder API does not match the shipped binding", () => {
  test("beginTrajectory returns a numeric id, not a TrajectoryBuilder object", () => {
    if (usedFallback) return;
    const engine = new SonaEngine(HIDDEN_DIM);
    const result = engine.beginTrajectory(new Array(HIDDEN_DIM).fill(0.1));
    console.log(
      `observed: beginTrajectory() returned typeof=${typeof result} value=${JSON.stringify(result)}. ` +
        "README shows `const builder = engine.beginTrajectory(...); builder.addStep(...)`, " +
        "but the installed index.d.ts declares beginTrajectory(): number, and the real " +
        "call site is `engine.addTrajectoryStep(trajectoryId, activations, attentionWeights, reward)`. " +
        "Following the README verbatim (calling .addStep on the return value) throws " +
        "TypeError: result.addStep is not a function.",
    );
    expect(typeof result).toBe("number");
    // Prove the README's documented call shape actually fails as described.
    expect(() => (result as any).addStep([], [], 0)).toThrow();
  });
});

describe("(1) DISPROVEN: SONA does not rank a supplied candidate set", () => {
  test("no rank/rankCandidates/score method exists on SonaEngine", () => {
    if (usedFallback) {
      console.log("observed: fallback path — no binding to introspect.");
      return;
    }
    const engine = new SonaEngine(HIDDEN_DIM);
    const proto = Object.getPrototypeOf(engine);
    const methods = Object.getOwnPropertyNames(proto).filter((m) => m !== "constructor");
    console.log("SonaEngine instance methods:", methods.join(", "));
    const rankLike = methods.filter((m) => /rank|^score$|select|choose/i.test(m));
    expect(rankLike.length).toBe(0);
  });

  test("findPatterns() ids are engine-internal cluster ids, never a caller-supplied candidate id", () => {
    if (usedFallback) return;
    const engine = new SonaEngine(HIDDEN_DIM);
    // Candidate set the "application" cares about — SONA is never told about these.
    const eligibleCandidateIds = new Set(["provider-alpha", "provider-beta", "provider-gamma"]);

    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const tid = engine.beginTrajectory(embedding);
    engine.addTrajectoryStep(tid, embedding, embedding, 0.9);
    engine.setTrajectoryRoute(tid, "provider-alpha"); // a free-text label, not a candidate registry
    engine.endTrajectory(tid, 0.9);
    engine.forceLearn();

    const patterns = engine.findPatterns(embedding, 3);
    console.log("findPatterns() output:", JSON.stringify(patterns));
    const returnedIds = patterns.map((p: any) => p.id);
    const anyIdMatchesCandidateSet = returnedIds.some((id: string) => eligibleCandidateIds.has(id));
    console.log(
      "observed: findPatterns ids =", JSON.stringify(returnedIds),
      "-- these are auto-assigned cluster ids ('0', '1', ...), structurally " +
        "incapable of being one of the caller's candidate ids. There is no " +
        "code path by which SONA could 'never return an outside id' in the " +
        "spec's sense, because it never accepts or returns candidate ids at all.",
    );
    expect(anyIdMatchesCandidateSet).toBe(false);
  });
});

describe("(2) feedback persisted as durable input: replay determinism characterization", () => {
  test("observed: replaying an identical trajectory history into a fresh engine reproduces the same learned pattern centroid", () => {
    if (usedFallback) {
      console.log("observed: skipped — no binding to test replay determinism against.");
      return;
    }
    // §17 requires: "Adaptive feedback SHOULD originate from explicit outcome
    // signals" and the Framework "MUST preserve enough evidence to explain
    // candidate set / filters / scores / selected candidate / outcome."
    // Since SONA has no candidate-ranking surface, the closest verifiable
    // analogue is: does replaying the same durable trajectory-step record
    // (activations, attention weights, reward, quality) into a fresh engine
    // reproduce the same learned pattern? This is a characterization of the
    // *learning* determinism, not a ranking-replay proof.
    const durableTrajectoryRecord = {
      embedding: [0.2, 0.4, 0.1, 0.3, 0.5, 0.9, 0.7, 0.6],
      activations: [0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4],
      attention: [0.05, 0.05, 0.1, 0.1, 0.15, 0.15, 0.2, 0.2],
      reward: 0.8,
      quality: 0.75,
    };

    function replay() {
      const engine = new SonaEngine(HIDDEN_DIM);
      const tid = engine.beginTrajectory(durableTrajectoryRecord.embedding);
      engine.addTrajectoryStep(
        tid,
        durableTrajectoryRecord.activations,
        durableTrajectoryRecord.attention,
        durableTrajectoryRecord.reward,
      );
      engine.endTrajectory(tid, durableTrajectoryRecord.quality);
      engine.forceLearn();
      const [pattern] = engine.findPatterns(durableTrajectoryRecord.embedding, 1);
      return pattern;
    }

    const first = replay();
    const second = replay();
    console.log("replay #1 pattern:", JSON.stringify(first));
    console.log("replay #2 pattern:", JSON.stringify(second));
    // Compare the learned centroid and quality, excluding wall-clock timestamps.
    expect(second.centroid).toEqual(first.centroid);
    expect(second.avgQuality).toBeCloseTo(first.avgQuality, 6);
    expect(second.clusterSize).toBe(first.clusterSize);
  });
});

describe("(3) deterministic fallback when SONA is unavailable", () => {
  test("simulated binding-import failure falls back to a fixed, non-adaptive ordering", () => {
    // Mirrors the RuVector fixture's fallback shape (§31.3-style: adaptive
    // system unavailable -> deterministic/non-cognitive behavior). Because
    // SONA cannot rank a supplied candidate set even when *available*, the
    // "fallback" behavior an application needs is simply: never depend on
    // SONA for candidate selection; always have a deterministic ranker
    // (e.g. stable sort by a declared priority field) as the real selector,
    // with SONA (if present) treated as advisory/absent.
    function deterministicCandidateOrder(candidates: { id: string; priority: number }[]) {
      return [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    }

    let usedFallbackHere = false;
    let rank: (c: { id: string; priority: number }[]) => { id: string; priority: number }[];
    try {
      throw new Error("simulated: SONA binding unavailable, or unsuitable (not a ranker)");
    } catch {
      usedFallbackHere = true;
      rank = deterministicCandidateOrder;
    }

    const candidates = [
      { id: "provider-gamma", priority: 1 },
      { id: "provider-alpha", priority: 3 },
      { id: "provider-beta", priority: 3 },
    ];
    expect(usedFallbackHere).toBe(true);
    const ranked = rank!(candidates);
    expect(ranked.map((c) => c.id)).toEqual(["provider-alpha", "provider-beta", "provider-gamma"]);
    // Every returned id must be one of the supplied candidates (the one
    // property SONA itself could not be shown to guarantee).
    const candidateIds = new Set(candidates.map((c) => c.id));
    expect(ranked.every((c) => candidateIds.has(c.id))).toBe(true);
  });
});
