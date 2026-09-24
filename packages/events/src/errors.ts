/** A stream append's expected version did not match (spec §10). Reread and retry; never overwrite. */
export class ConcurrencyError extends Error {
  override readonly name = "ConcurrencyError";
  constructor(
    readonly streamId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(`Stream ${streamId} is at version ${actualVersion}, expected ${expectedVersion}`);
  }
}

/** A record write's expected version did not match. */
export class RecordConflictError extends Error {
  override readonly name = "RecordConflictError";
  constructor(
    readonly collection: string,
    readonly id: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(`Record ${collection}/${id} is at version ${actualVersion}, expected ${expectedVersion}`);
  }
}

/** An idempotency key was reused for a different request. */
export class IdempotencyMismatchError extends Error {
  override readonly name = "IdempotencyMismatchError";
  constructor(
    readonly scope: string,
    readonly key: string,
  ) {
    super(`Idempotency key ${scope}/${key} was already used for a different request`);
  }
}

export class EnvelopeValidationError extends Error {
  override readonly name = "EnvelopeValidationError";
  constructor(readonly issues: readonly string[]) {
    super(`Invalid event envelope: ${issues.join("; ")}`);
  }
}

/** A projection commit's fromPosition did not match the stored checkpoint. */
export class CheckpointConflictError extends Error {
  override readonly name = "CheckpointConflictError";
}

export class NotFoundError extends Error {
  override readonly name = "NotFoundError";
}
