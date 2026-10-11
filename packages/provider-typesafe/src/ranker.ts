/**
 * Bridges the System One judgment provider into Cognate's Ranker boundary. Governance is
 * inherited from the selector: this adapter sees only the eligible set, and its output is
 * validated so a judgment can order the eligible candidates but never reintroduce a
 * deterministically eliminated one, vote for an unknown id, or fail open — malformed or
 * abstaining answers yield an empty ranking and the selector's deterministic fallback applies.
 */
import type { Candidate, Ranker, SelectionRequest } from "@godspeedai/cognate-capabilities";
import type { Json } from "@godspeedai/cognate-events";
import type { JudgmentProvider, JudgmentRequest } from "@godspeedai/cognate-capabilities";

export interface TypeSafeRankerOptions {
  /** Human-readable candidate descriptions strengthen the judgment state; ids stay opaque. */
  readonly describe?: (candidate: Candidate, request: SelectionRequest) => string;
  /** Present the eligible set to the judge in groups of at most this size (2-8). */
  readonly groupSize?: number;
  /** Stop eliminating once this many candidates remain, then judge the shortlist as a whole. */
  readonly shortlistSize?: number;
}

function candidateDescription(candidate: Candidate, options: TypeSafeRankerOptions, request: SelectionRequest): string {
  if (options.describe) return options.describe(candidate, request);
  const attributes = Object.entries(candidate.contract.attributes ?? {})
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
  return `${candidate.contract.id} (${attributes})`;
}

function summarize(request: SelectionRequest): Json {
  return {
    requirement: { capability: request.requirement.capability, ...(request.requirement.version ? { version: request.requirement.version } : {}) },
    ...(request.context ?? {}),
  };
}

/** One choice question over the given candidate ids; returns the winner or undefined on abstention. */
async function judgeChoice(
  provider: JudgmentProvider,
  candidates: readonly Candidate[],
  request: SelectionRequest,
  options: TypeSafeRankerOptions,
): Promise<string | undefined> {
  const criteria: Record<string, string> = {};
  for (const candidate of candidates) criteria[candidate.providerId] = candidateDescription(candidate, options, request);
  const judgmentRequest: JudgmentRequest = {
    state: summarize(request),
    questions: {
      selection: {
        type: "choice",
        instructions: `Which option best satisfies the requirement "${request.requirement.capability}"? Choose exactly one option id.`,
        criteria,
      },
    },
  };
  const response = await provider.evaluate(judgmentRequest);
  const answer = response.answers.selection;
  if (!answer || answer.type !== "choice") return undefined; // abstention/uncertainty: no ranking
  // A choice outside the presented set is invalid — never widened, never reintroduced.
  return Object.hasOwn(criteria, answer.choice) ? answer.choice : undefined;
}

/**
 * A guarded Ranker backed by typed judgment. Tournament shortlisting first (repeated small
 * eliminations over groups), then one final judgment over the shortlist. Candidates the judge
 * never scores stay in the eligible set; the selector appends them in deterministic order.
 */
export function typeSafeRanker(provider: JudgmentProvider, options: TypeSafeRankerOptions = {}): Ranker {
  const groupSize = Math.min(Math.max(options.groupSize ?? 4, 2), 8);
  const shortlistSize = Math.min(Math.max(options.shortlistSize ?? 3, 1), groupSize);
  return {
    id: `typesafe-ranker:${provider.id}`,
    async rank(eligible, request) {
      if (eligible.length === 0) return [];
      if (eligible.length === 1) return [{ providerId: eligible[0]!.providerId, score: 1 }];

      // Repeated elimination: group winners advance until the shortlist is small enough.
      let remaining = [...eligible];
      while (remaining.length > shortlistSize) {
        const winners: Candidate[] = [];
        for (let index = 0; index < remaining.length; index += groupSize) {
          const group = remaining.slice(index, index + groupSize);
          const choice = await judgeChoice(provider, group, request, options);
          if (choice === undefined) return []; // an inconclusive heat eliminates nothing reliably: fall back
          const winner = group.find((candidate) => candidate.providerId === choice);
          if (!winner) return [];
          winners.push(winner);
        }
        remaining = winners;
      }
      if (remaining.length === 1) return [{ providerId: remaining[0]!.providerId, score: 1 }];

      const choice = await judgeChoice(provider, remaining, request, options);
      if (choice === undefined) return [];
      // The judge's winner leads; the rest of the shortlist follows deterministically so the
      // output is a total order over everything the judge actually saw.
      return [...remaining]
        .map((candidate) => ({ providerId: candidate.providerId, score: candidate.providerId === choice ? 1 : 0 }))
        .sort((a, b) => b.score - a.score || (a.providerId < b.providerId ? -1 : 1));
    },
  };
}

/**
 * Per-candidate scored ranking (no tournament): asks the judge for a fit score per eligible
 * candidate. Invalid or abstaining scores are skipped, never clamped into range.
 */
export function typeSafeDirectRanker(provider: JudgmentProvider, options: TypeSafeRankerOptions = {}): Ranker {
  return {
    id: `typesafe-direct-ranker:${provider.id}`,
    async rank(eligible, request) {
      if (eligible.length === 0) return [];
      if (eligible.length === 1) return [{ providerId: eligible[0]!.providerId, score: 1 }];
      const levels = ["poor", "fair", "good", "excellent"].slice(0, Math.max(options.groupSize ?? 4, 2));
      const scores: { providerId: string; score: number }[] = [];
      for (const candidate of eligible) {
        const judgmentRequest: JudgmentRequest = {
          state: summarize(request),
          questions: {
            fit: {
              type: "score",
              instructions: `Score how well "${candidateDescription(candidate, options, request)}" satisfies "${request.requirement.capability}" (${levels[0]} = worst, ${levels.at(-1)} = best).`,
              criteria: levels,
            },
          },
        };
        const answer = (await provider.evaluate(judgmentRequest)).answers.fit;
        if (!answer || answer.type !== "score" || !Number.isFinite(answer.score)) continue;
        scores.push({ providerId: candidate.providerId, score: answer.score });
      }
      return scores;
    },
  };
}
