/** Aggregated disposer failures from one teardown (spec §8.5, §31.1). */
export class CleanupError extends AggregateError {
  override readonly name = "CleanupError";
  constructor(
    readonly componentId: string,
    errors: readonly unknown[],
  ) {
    super(errors, `${errors.length} disposer(s) failed while tearing down ${componentId}`);
  }
}

/** Throw from `activate` to mark a failure that retrying cannot fix; requires `reset()`. */
export class PermanentActivationError extends Error {
  override readonly name = "PermanentActivationError";
}

/** Activation exceeded its timeout; treated as a transient failure. */
export class ActivationTimeoutError extends Error {
  override readonly name = "ActivationTimeoutError";
}

/** A component tried to provide a capability it did not declare. */
export class UndeclaredCapabilityError extends Error {
  override readonly name = "UndeclaredCapabilityError";
}

export class ScopeClosedError extends Error {
  override readonly name = "ScopeClosedError";
}
