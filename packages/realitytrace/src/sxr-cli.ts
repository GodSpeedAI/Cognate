import type { ObservationPort } from "./types.ts";

export interface SxrCliOptions {
  /** Path to the pinned `sxr` binary (DEBT-010). */
  readonly bin: string;
  /** Working directory holding the enrolled repository and SXR state. */
  readonly repoDir: string;
  /** Extra environment (e.g. SXR home) for isolation. */
  readonly env?: Record<string, string>;
}

/** Identifiers produced by the SXR prerequisite workflow (enroll → question → threshold → run). */
export interface SxrWorkflow {
  readonly repoId: string;
  readonly questionId: string;
  readonly thresholdId: string;
  readonly runId: string;
  readonly target: string;
}

/**
 * ObservationPort over the documented SXR CLI. `prepare()` completes the prerequisite workflow; `record()` creates a
 * plan with verifier `cognate.<observationId>` and ingests the observation JSON on stdin. SXR deduplicates by
 * (run, verifier), so retries of one observation reconcile as `duplicate` with the same ledger position. SXR retains
 * the bytes but does not interpret Cognate fields; correlation lives in Cognate's receipts (DEBT-009).
 */
export function createSxrCliPort(_options: SxrCliOptions): ObservationPort & { prepare(question: { readonly title: string }): Promise<SxrWorkflow> } {
  throw new Error("realitytrace: not implemented");
}
