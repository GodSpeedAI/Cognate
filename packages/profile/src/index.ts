// Profiles are composition (spec §29): named selections of registered component factories. No kernel primitive here.

export interface ProfileDefinition {
  readonly name: string;
  readonly description: string;
  /** Registered component names, in mount order. */
  readonly components: readonly string[];
  /** Per-component configuration, passed to its factory. */
  readonly options: Readonly<Record<string, unknown>>;
}

export class ProfileError extends Error {
  override readonly name = "ProfileError";
}

/** Validate and freeze a profile. Names must be unique and non-empty. */
export function defineProfile(_profile: { readonly name: string; readonly description?: string; readonly components: readonly string[]; readonly options?: Readonly<Record<string, unknown>> }): ProfileDefinition {
  throw new Error("profile: not implemented");
}

/** A component factory provided by a package. `supported: false` records a Phase 0 gate that failed or is unmet. */
export interface ComponentEntry<T> {
  readonly name: string;
  readonly package: string;
  readonly supported: boolean;
  /** Required when unsupported: the blocking reason (e.g. a DEBT id). */
  readonly reason?: string;
  contribute(options: unknown): T;
}

export interface ResolvedProfile<T> {
  readonly profile: ProfileDefinition;
  /** Contributions of supported components, in profile order. */
  readonly contributions: readonly { readonly name: string; readonly package: string; readonly contribution: T }[];
  /** Components that were requested but not included, with reasons. Never silently dropped. */
  readonly unresolved: readonly { readonly name: string; readonly reason: string }[];
}

export function resolveProfile<T>(_profile: ProfileDefinition, _registry: readonly ComponentEntry<T>[]): ResolvedProfile<T> {
  throw new Error("profile: not implemented");
}
