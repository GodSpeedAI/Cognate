// CG-CAP-002 / §40.I: adaptive ranking can never select an ineligible candidate.
import { expect, test } from "bun:test";
import fc from "fast-check";
import { compatibilityRule, createSelector, type Candidate, type EligibilityRule, type Ranker } from "@godspeedai/cognate-capabilities";

const candidateArb = fc.record({
  providerId: fc.string({ minLength: 1, maxLength: 6 }),
  contract: fc.record({
    id: fc.constantFrom("model.generate", "tool.search"),
    version: fc.constantFrom("0.9.0", "1.0.0", "1.4.2", "2.0.0"),
    attributes: fc.record({ tier: fc.constantFrom("free", "paid"), hosting: fc.constantFrom("local", "cloud") }),
  }),
});

test("for arbitrary candidates, rules, and adversarial rankers, the selection is eligible", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uniqueArray(candidateArb, { selector: (c) => c.providerId, maxLength: 12 }),
      fc.constantFrom("local", "cloud"),
      fc.dictionary(fc.string({ maxLength: 6 }), fc.oneof(fc.double(), fc.constant(Number.NaN), fc.constant(Number.POSITIVE_INFINITY))),
      fc.boolean(),
      async (candidates: Candidate[], forbidden, scores, throws) => {
        const rule: EligibilityRule = { id: "no-hosting", evaluate: (c) => ({ eligible: c.contract.attributes?.hosting !== forbidden, reason: "hosting" }) };
        const ranker: Ranker = {
          id: "adversary",
          rank: async (eligible) => {
            if (throws) throw new Error("adversary");
            return [...candidates, ...eligible].map((c) => ({ providerId: c.providerId, score: scores[c.providerId] ?? 1e9 }));
          },
        };
        const decision = await createSelector({ rules: [compatibilityRule, rule], ranker }).select({ requirement: { capability: "model.generate", version: "1.0" }, candidates, principal: { id: "p", kind: "agent" }, tenant: "t" });
        const eligible = candidates.filter((c) => c.contract.id === "model.generate" && c.contract.version.startsWith("1.") && c.contract.attributes?.hosting !== forbidden).map((c) => c.providerId);
        expect([...decision.eligible].sort()).toEqual([...eligible].sort());
        if (eligible.length === 0) expect(decision.selected).toBeNull();
        else expect(eligible).toContain(decision.selected!);
      },
    ),
    { numRuns: 300 },
  );
});
