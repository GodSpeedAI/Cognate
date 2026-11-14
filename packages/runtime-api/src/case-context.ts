// Shape check for `CaseContext` at the service boundary. The patterns mirror the CEP extension schema
// `godspeed.interaction_event.v1`, so a context that passes here can always form a valid interaction event.
import type { CaseContext } from "./types.ts";

const WORLD = /^world:[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*@sha256:[0-9a-f]{64}$/;
const SEMANTIC = /^[A-Za-z0-9_.-]+::[A-Za-z0-9_.-]+$/;
const EPISODE = /^episode:[^:@\s]+:[^:@\s]+:[0-9]+@sha256:[0-9a-f]{64}$/;
const ASSIGNMENT = /^assign:[^:\s]+:[^:\s]+:[0-9]+:[0-9]+$/;
const EXPECTATION = /^(question|threshold):.+$/;

/** Problems with a case context; empty when it is well formed. */
export function caseContextIssues(context: CaseContext): string[] {
  const issues: string[] = [];
  const text = (v: unknown) => typeof v === "string" && v.length > 0;
  if (!WORLD.test(String(context.worldRef))) issues.push("worldRef must be world:<name>@sha256:<64 hex>");
  if (!SEMANTIC.test(String(context.semanticRef))) issues.push("semanticRef must be namespace::name");
  for (const key of ["caseId", "planItemId", "role"] as const) if (!text(context[key])) issues.push(`${key} is required`);
  if (context.kind !== "evaluated" && context.kind !== "exploratory") issues.push("kind must be evaluated or exploratory");
  if (context.episodeRef !== undefined && !EPISODE.test(context.episodeRef)) issues.push("episodeRef is malformed");
  if (context.kind === "evaluated" && context.episodeRef === undefined) issues.push("an evaluated run needs episodeRef");
  if (context.assignmentId !== undefined && !ASSIGNMENT.test(context.assignmentId)) issues.push("assignmentId is malformed");
  if (context.expectationRefs !== undefined) {
    const refs = context.expectationRefs;
    if (!Array.isArray(refs) || !refs.every((r) => EXPECTATION.test(r))) issues.push("expectationRefs must be question:/threshold: ids");
    else if (new Set(refs).size !== refs.length) issues.push("expectationRefs must be unique");
  }
  if (context.executorProvenance !== undefined && !["program", "live", "injected_fault"].includes(context.executorProvenance)) issues.push("executorProvenance is invalid");
  return issues;
}
