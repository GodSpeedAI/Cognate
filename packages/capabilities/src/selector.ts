import { randomUUID } from "node:crypto";
import { isCompatible } from "@cognate/kernel-api";
import type { DurableStore, Json } from "@cognate/events";
import type { Projection, ProjectionState } from "@cognate/projections";
import type { Candidate, EligibilityRule, Outcome, Ranker, SelectionDecision, SelectionRequest } from "./types.ts";

export interface SelectorOptions {
  readonly rules: readonly EligibilityRule[];
  readonly ranker?: Ranker;
  readonly ids?: () => string;
}

function byProviderIdAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Two-phase selection (spec §3.6, §8.2): every rule filters first; the ranker orders only the eligible set.
 * Unknown, duplicate, or non-finite ranker output is ignored; ranker failure falls back to deterministic order
 * (lexicographic providerId). The selected provider is always eligible.
 */
export function createSelector(options: SelectorOptions): { select(request: SelectionRequest): Promise<SelectionDecision> } {
  return {
    async select(request: SelectionRequest): Promise<SelectionDecision> {
      const candidates = request.candidates;
      const filters: { providerId: string; ruleId: string; eligible: boolean; reason: string }[] = [];
      const eligibleFlags = new Map<string, boolean>();
      for (const candidate of candidates) eligibleFlags.set(candidate.providerId, true);

      for (const rule of options.rules) {
        for (const candidate of candidates) {
          const result = rule.evaluate(candidate, request);
          filters.push({ providerId: candidate.providerId, ruleId: rule.id, eligible: result.eligible, reason: result.reason });
          if (!result.eligible) eligibleFlags.set(candidate.providerId, false);
        }
      }

      const eligibleCandidates = candidates.filter((c) => eligibleFlags.get(c.providerId) === true);
      const eligible = eligibleCandidates.map((c) => c.providerId);

      let scores: readonly { readonly providerId: string; readonly score: number }[] = [];
      let selected: string | null = null;
      let rankerId: string | null = options.ranker?.id ?? null;
      let fallback: string | null = null;

      if (eligible.length === 0) {
        // no eligible candidate: selected stays null, ranker is never called.
      } else if (!options.ranker) {
        fallback = "no ranker";
        selected = [...eligible].sort(byProviderIdAsc)[0]!;
      } else {
        try {
          const raw = await options.ranker.rank(eligibleCandidates, request);
          const seen = new Set<string>();
          const validated: { providerId: string; score: number }[] = [];
          for (const entry of raw) {
            if (!eligibleFlags.get(entry.providerId)) continue; // unknown or not eligible
            if (seen.has(entry.providerId)) continue; // duplicate
            if (!Number.isFinite(entry.score)) continue; // non-finite
            seen.add(entry.providerId);
            validated.push({ providerId: entry.providerId, score: entry.score });
          }
          scores = validated;

          const ranked = [...validated].sort((a, b) => b.score - a.score || byProviderIdAsc(a.providerId, b.providerId));
          const omitted = eligible.filter((id) => !seen.has(id)).sort(byProviderIdAsc);
          const order = [...ranked.map((s) => s.providerId), ...omitted];
          selected = order[0] ?? null;
        } catch (error) {
          fallback = `ranker failed: ${error instanceof Error ? error.message : String(error)}`;
          scores = [];
          selected = [...eligible].sort(byProviderIdAsc)[0]!;
        }
      }

      return {
        selectionId: options.ids ? options.ids() : randomUUID(),
        requirement: request.requirement,
        candidates: candidates.map((c) => c.providerId),
        filters,
        eligible,
        scores,
        selected,
        ranker: rankerId,
        fallback,
      };
    },
  };
}

/** Built-in rule: contract compatibility with the requirement (identity, major version, attributes). */
export const compatibilityRule: EligibilityRule = {
  id: "compatibility",
  evaluate(candidate, request) {
    const ok = isCompatible(request.requirement, candidate.contract);
    return { eligible: ok, reason: ok ? "compatible with requirement" : "incompatible with requirement" };
  },
};

export interface RecordContext {
  readonly tenant: string;
  readonly scopeId: string;
  readonly correlationId: string;
  readonly runId: string | null;
  readonly causationId?: string;
}

/** Append `capability.selected` with the full explanation (stream `selection-<selectionId>`). */
export async function recordSelection(store: DurableStore, decision: SelectionDecision, context: RecordContext): Promise<void> {
  const streamId = `selection-${decision.selectionId}`;
  const expectedVersion = await store.streamVersion(streamId);
  await store.commit({
    appends: [
      {
        streamId,
        expectedVersion,
        events: [
          {
            eventType: "capability.selected",
            schemaVersion: 1,
            occurredAt: new Date().toISOString(),
            tenant: context.tenant,
            correlationId: context.correlationId,
            causationId: context.causationId ?? null,
            runId: context.runId,
            scopeId: context.scopeId,
            payload: decision as unknown as Json,
          },
        ],
      },
    ],
  });
}

/** Append `capability.outcome` for a recorded selection. Must be durable before it can influence ranking (spec §15). */
export async function recordOutcome(store: DurableStore, selectionId: string, outcome: Outcome, context: RecordContext): Promise<void> {
  const streamId = `selection-${selectionId}`;
  const expectedVersion = await store.streamVersion(streamId);
  const payload: Json = {
    selectionId,
    success: outcome.success,
    ...(outcome.latencyMs !== undefined ? { latencyMs: outcome.latencyMs } : {}),
    ...(outcome.cost !== undefined ? { cost: outcome.cost } : {}),
  };
  await store.commit({
    appends: [
      {
        streamId,
        expectedVersion,
        events: [
          {
            eventType: "capability.outcome",
            schemaVersion: 1,
            occurredAt: new Date().toISOString(),
            tenant: context.tenant,
            correlationId: context.correlationId,
            causationId: context.causationId ?? null,
            runId: context.runId,
            scopeId: context.scopeId,
            payload,
          },
        ],
      },
    ],
  });
}

const OUTCOME_PROJECTION_NAME = "capability-outcomes";
const OUTCOME_PROJECTION_VERSION = "1";

interface SelectionStats {
  readonly providerId: string;
  readonly capability: string;
}

interface OutcomeStats {
  readonly successes: number;
  readonly total: number;
}

/**
 * Cognate-owned outcome ranker (SONA was rejected, ADR-0005): a rebuildable projection over `capability.outcome`
 * events counting each provider's successes and outcomes for a capability id.
 */
export function outcomeProjection(): Projection {
  return {
    name: OUTCOME_PROJECTION_NAME,
    version: OUTCOME_PROJECTION_VERSION,
    apply(event, state: ProjectionState) {
      if (event.eventType === "capability.selected") {
        const payload = event.payload as { selectionId: string; selected: string | null; requirement: { capability: string } } | null;
        if (!payload || payload.selected === null) return [];
        const value: SelectionStats = { providerId: payload.selected, capability: payload.requirement.capability };
        return [{ key: `selection:${payload.selectionId}`, value: value as unknown as Json }];
      }
      if (event.eventType === "capability.outcome") {
        const payload = event.payload as { selectionId: string; success: boolean } | null;
        if (!payload) return [];
        const selection = state.get(`selection:${payload.selectionId}`) as unknown as SelectionStats | undefined;
        if (!selection) return [];
        const statsKey = `stats:${selection.capability}:${selection.providerId}`;
        const existing = (state.get(statsKey) as unknown as OutcomeStats | undefined) ?? { successes: 0, total: 0 };
        const updated: OutcomeStats = { successes: existing.successes + (payload.success ? 1 : 0), total: existing.total + 1 };
        return [{ key: statsKey, value: updated as unknown as Json }];
      }
      return [];
    },
  };
}

/**
 * UCB1 over the eligible set (Auer et al., 2002): `successRate + sqrt(2 ln N / n)`, where `n` is a provider's recorded
 * outcomes and `N` the total across the eligible providers. Untried providers score `Number.MAX_VALUE` (finite, so the
 * selector accepts it) and are tried first; ties fall to provider-id order. Deterministic: a pure function of the
 * projection, so replaying the same outcomes yields the same ranking.
 */
export function createOutcomeRanker(store: DurableStore): Ranker {
  return {
    id: "outcome-ranker",
    async rank(eligible: readonly Candidate[], request: SelectionRequest) {
      const capability = request.requirement.capability;
      const stats = await Promise.all(
        eligible.map(async (candidate) => {
          const read = (await store.readProjection(OUTCOME_PROJECTION_NAME, `stats:${capability}:${candidate.providerId}`)) as unknown as OutcomeStats | undefined;
          return { providerId: candidate.providerId, successes: read?.successes ?? 0, total: read?.total ?? 0 };
        }),
      );
      const plays = stats.reduce((sum, s) => sum + s.total, 0);
      return stats.map(({ providerId, successes, total }) => ({
        providerId,
        score: total === 0 ? Number.MAX_VALUE : successes / total + Math.sqrt((2 * Math.log(plays)) / total),
      }));
    },
  };
}
