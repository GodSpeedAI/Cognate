import type { Json } from "@godspeedai/events";
import type { SemanticRef } from "@godspeedai/kernel-api";

/** A framework execution observation (spec §20). Correlation fields are Cognate's; SXR decides what becomes evidence. */
export interface Observation {
  /** Stable id: derived from the source event, identical on every retry. */
  readonly observationId: string;
  readonly eventId: string;
  readonly tenant: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly runId: string | null;
  readonly scopeId: string;
  readonly componentId?: string;
  readonly fiberId?: string;
  readonly capabilityId?: string;
  readonly continuationId?: string;
  readonly semanticRef?: SemanticRef;
  readonly classification: "reversible_effect" | "durable_fact" | "external_commitment";
  readonly inputRef?: string;
  readonly outputRef?: string;
  readonly timestamp: string;
  /**
   * The CEP `execution_trace` envelope for this observation, when the operation was governed. If present it is
   * what RealityTrace is handed to record (content-addressed), instead of the bare observation.
   */
  readonly trace?: Json;
}

/**
 * Result of one delivery attempt. `accepted`/`duplicate` mean the target recorded (or had already recorded) the
 * observation. None of these statuses is evidence or settlement (spec §20).
 */
export type DeliveryReceipt =
  | { readonly status: "accepted"; readonly observationId: string; readonly targetRef: string; readonly detail: Json }
  | { readonly status: "duplicate"; readonly observationId: string; readonly targetRef: string; readonly detail: Json };

/** Implementation-independent observation port. Throws on delivery failure; the outbox retries. */
export interface ObservationPort {
  readonly id: string;
  record(observation: Observation): Promise<DeliveryReceipt>;
}

/** Persisted delivery status per source event (collection `observations`). */
export interface ObservationStatus {
  readonly eventId: string;
  readonly observationId: string;
  readonly state: "queued" | "accepted" | "duplicate" | "retrying" | "failed";
  readonly attempts: number;
  readonly targetRef: string | null;
  readonly lastError: string | null;
}
