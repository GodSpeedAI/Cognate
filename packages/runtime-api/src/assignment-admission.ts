// Pure admission rules and trusted ports for external assigned starts. No provider is enabled here.
import type { Json } from "@godspeedai/cognate-events";
import type { Assignment } from "./assignment.ts";
import type { Caller, CaseContext, SeaAssignmentRef } from "./types.ts";

export interface VerifiedAssignmentDelegation extends SeaAssignmentRef {
  readonly tenant: string;
  readonly delegate: Caller["actor"];
  readonly expiresAt: string;
}

export interface ResolvedAssignment {
  readonly assignment: Assignment;
  readonly caseContext: CaseContext;
  readonly agent: string;
  /** Trusted agent input must convey the Brief as required by the selected agent. */
  readonly input: Json;
}

/**
 * Both ports are trusted and tenant-scoped; lookup must not have side effects.
 * A production integration needs an authority reservation/commit contract to prevent a link
 * being superseded between verification and the separate runtime store commit.
 */
export interface AssignmentAdmission {
  /** Verify the exact link ID against current trusted SEA state for this caller. */
  readonly verify: (caller: Caller, ref: SeaAssignmentRef) => Promise<VerifiedAssignmentDelegation | undefined>;
  /** Resolve the exact link to authoritative assignment, context, run target and agent input. */
  readonly lookup: (caller: Caller, ref: SeaAssignmentRef) => Promise<ResolvedAssignment | undefined>;
}

export function validAssignmentRef(ref: SeaAssignmentRef): boolean {
  return !!(ref.caseId && ref.assignmentId && ref.episodeRef && ref.linkId);
}

export function assignmentBindingMatches(ref: SeaAssignmentRef, resolved: ResolvedAssignment | undefined): resolved is ResolvedAssignment {
  if (!resolved?.assignment || !resolved.caseContext) return false;
  const { assignment, caseContext } = resolved;
  return assignment.case_id === ref.caseId && assignment.assignment_id === ref.assignmentId && assignment.episode_ref === ref.episodeRef
    && caseContext.caseId === ref.caseId && caseContext.planItemId === assignment.step_id
    && (caseContext.assignmentId === undefined || caseContext.assignmentId === ref.assignmentId)
    && (caseContext.episodeRef === undefined || caseContext.episodeRef === ref.episodeRef)
    && !!resolved.agent && resolved.input !== undefined;
}

export function verifiedAssignmentMatches(ref: SeaAssignmentRef, caller: Caller, verified: VerifiedAssignmentDelegation | undefined, now: number): verified is VerifiedAssignmentDelegation {
  if (!verified) return false;
  const expiry = Date.parse(verified.expiresAt);
  return verified.linkId === ref.linkId && verified.caseId === ref.caseId && verified.assignmentId === ref.assignmentId
    && verified.episodeRef === ref.episodeRef && verified.tenant === caller.tenant
    && verified.delegate?.id === caller.actor.id && verified.delegate?.kind === caller.actor.kind
    && Number.isFinite(expiry) && expiry > now;
}
