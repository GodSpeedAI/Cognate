import type { Json } from "@cognate/events";
import type { CapabilityContract, Principal, Requirement } from "@cognate/kernel-api";

export interface Candidate {
  readonly providerId: string;
  readonly contract: CapabilityContract;
}

export interface SelectionRequest {
  readonly requirement: Requirement;
  readonly candidates: readonly Candidate[];
  readonly principal: Principal;
  readonly tenant: string;
  /** Opaque task context for rankers (e.g. task kind); never used for eligibility. */
  readonly context?: { readonly [key: string]: Json };
}

/** A deterministic eligibility rule (semantic, security, policy, compatibility). Must be pure. */
export interface EligibilityRule {
  readonly id: string;
  evaluate(candidate: Candidate, request: SelectionRequest): { readonly eligible: boolean; readonly reason: string };
}

/** Adaptive ranking; sees only eligible candidates. May be unavailable or misbehave; it can never widen the set. */
export interface Ranker {
  readonly id: string;
  rank(eligible: readonly Candidate[], request: SelectionRequest): Promise<readonly { readonly providerId: string; readonly score: number }[]>;
}

export interface SelectionDecision {
  readonly selectionId: string;
  readonly requirement: Requirement;
  readonly candidates: readonly string[];
  readonly filters: readonly { readonly providerId: string; readonly ruleId: string; readonly eligible: boolean; readonly reason: string }[];
  readonly eligible: readonly string[];
  readonly scores: readonly { readonly providerId: string; readonly score: number }[];
  /** `null` when no candidate is eligible. */
  readonly selected: string | null;
  readonly ranker: string | null;
  /** Why deterministic ordering was used instead of the ranker, if it was. */
  readonly fallback: string | null;
}

export interface Outcome {
  readonly success: boolean;
  readonly latencyMs?: number;
  readonly cost?: number;
}
