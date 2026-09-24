import type { Json, StoredEvent } from "@cognate/events";

/** Read access to projection state inside a batch; reflects writes made earlier in the same batch. */
export interface ProjectionState {
  get(key: string): Json | undefined;
}

export interface ProjectionWrite {
  readonly key: string;
  /** `null` deletes the key. */
  readonly value: Json | null;
}

/**
 * A deterministic derivation from events (spec §11). `apply` must depend only on the event and state:
 * nondeterministic inputs (clock, randomness, model output, remote responses) must already be recorded as events.
 */
export interface Projection {
  readonly name: string;
  /** Code version; a stored checkpoint with another version must be rebuilt, never silently reinterpreted. */
  readonly version: string;
  apply(event: StoredEvent, state: ProjectionState): readonly ProjectionWrite[] | Promise<readonly ProjectionWrite[]>;
}

export type CatchUpResult =
  | { readonly status: "ok"; readonly position: number; readonly applied: number }
  | { readonly status: "error"; readonly position: number; readonly error: { readonly position: number; readonly eventId: string; readonly message: string } }
  | { readonly status: "rebuild_required"; readonly storedVersion: string };
