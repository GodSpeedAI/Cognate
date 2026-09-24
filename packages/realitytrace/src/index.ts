export type * from "./types.ts";
import type { DurableStore, OutboxIntent, StoredEvent } from "@cognate/events";
import type { Observation, ObservationPort, ObservationStatus } from "./types.ts";

export const OBSERVATION_TOPIC = "observation.deliver";

/** Build the observation for a committed event and the outbox intent to include in the SAME decision (spec §13.1). */
export function observationIntent(_event: Pick<StoredEvent, "eventId" | "tenant" | "correlationId" | "causationId" | "runId" | "scopeId" | "componentId" | "fiberId" | "semanticRef" | "recordedAt">, _extra: Pick<Observation, "classification"> & Partial<Pick<Observation, "capabilityId" | "continuationId" | "inputRef" | "outputRef">>): OutboxIntent {
  throw new Error("realitytrace: not implemented");
}

export interface DeliveryOptions {
  readonly port: ObservationPort;
  readonly backoff: { readonly baseMs: number; readonly maxMs: number; readonly maxAttempts: number };
  readonly now?: () => number;
}

/** Normal mode: at-least-once delivery from the committed outbox with persisted receipts and reconciliation status. */
export class ObservationDelivery {
  constructor(_store: DurableStore, _options: DeliveryOptions) {}
  /** Deliver available observations once; failures never touch committed framework events. */
  drain(): Promise<{ readonly delivered: readonly string[]; readonly retried: readonly string[]; readonly failed: readonly string[] }> {
    throw new Error("realitytrace: not implemented");
  }
  status(_eventId: string): Promise<ObservationStatus | undefined> {
    throw new Error("realitytrace: not implemented");
  }
  /** Observations needing operator attention (poisoned deliveries). */
  unreconciled(): Promise<ObservationStatus[]> {
    throw new Error("realitytrace: not implemented");
  }
  /**
   * Strict-mode gate for a specific operation (spec §20): true only if the target accepted (or already had) the
   * observation. Queued or retrying is not enough, and acceptance is still not evidence.
   */
  isRecorded(_eventId: string): Promise<boolean> {
    throw new Error("realitytrace: not implemented");
  }
}

export { createSxrCliPort, type SxrCliOptions, type SxrWorkflow } from "./sxr-cli.ts";
