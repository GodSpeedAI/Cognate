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
export function defineProfile(profile: { readonly name: string; readonly description?: string; readonly components: readonly string[]; readonly options?: Readonly<Record<string, unknown>> }): ProfileDefinition {
  if (profile.name.length === 0) throw new ProfileError("profile name must not be empty");
  const seen = new Set<string>();
  for (const name of profile.components) {
    if (name.length === 0) throw new ProfileError("component name must not be empty");
    if (seen.has(name)) throw new ProfileError(`duplicate component name: ${name}`);
    seen.add(name);
  }
  return Object.freeze({
    name: profile.name,
    description: profile.description ?? "",
    components: Object.freeze([...profile.components]),
    options: Object.freeze({ ...(profile.options ?? {}) }),
  });
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

export function resolveProfile<T>(profile: ProfileDefinition, registry: readonly ComponentEntry<T>[]): ResolvedProfile<T> {
  const byName = new Map(registry.map((entry) => [entry.name, entry]));
  const contributions: { name: string; package: string; contribution: T }[] = [];
  const unresolved: { name: string; reason: string }[] = [];
  for (const name of profile.components) {
    const entry = byName.get(name);
    if (!entry) {
      unresolved.push({ name, reason: "unknown component" });
      continue;
    }
    if (!entry.supported) {
      unresolved.push({ name, reason: entry.reason ?? "unsupported component" });
      continue;
    }
    contributions.push({ name: entry.name, package: entry.package, contribution: entry.contribute(profile.options[name]) });
  }
  return { profile, contributions, unresolved };
}
