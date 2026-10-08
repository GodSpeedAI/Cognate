export type * from "./types.ts";
export * from "./godspeed.ts";
import type { DurableStore, Json, OutboxIntent, StoredEvent } from "@godspeedai/events";
import { OutboxDispatcher } from "@godspeedai/events";
import type { Observation, ObservationPort, ObservationStatus } from "./types.ts";

export const OBSERVATION_TOPIC = "observation.deliver";

const OBSERVATIONS_COLLECTION = "observations";

/** Build the observation for a committed event and the outbox intent to include in the SAME decision (spec §13.1). */
export function observationIntent(
  event: Pick<StoredEvent, "eventId" | "tenant" | "correlationId" | "causationId" | "runId" | "scopeId" | "componentId" | "fiberId" | "semanticRef" | "recordedAt">,
  extra: Pick<Observation, "classification"> & Partial<Pick<Observation, "capabilityId" | "continuationId" | "inputRef" | "outputRef" | "trace">>,
): OutboxIntent {
  const observation: Observation = {
    observationId: `obs-${event.eventId}`,
    eventId: event.eventId,
    tenant: event.tenant,
    correlationId: event.correlationId,
    causationId: event.causationId,
    runId: event.runId,
    scopeId: event.scopeId,
    ...(event.componentId !== undefined ? { componentId: event.componentId } : {}),
    ...(event.fiberId !== undefined ? { fiberId: event.fiberId } : {}),
    ...(extra.capabilityId !== undefined ? { capabilityId: extra.capabilityId } : {}),
    ...(extra.continuationId !== undefined ? { continuationId: extra.continuationId } : {}),
    ...(event.semanticRef !== undefined ? { semanticRef: event.semanticRef } : {}),
    classification: extra.classification,
    ...(extra.inputRef !== undefined ? { inputRef: extra.inputRef } : {}),
    ...(extra.outputRef !== undefined ? { outputRef: extra.outputRef } : {}),
    ...(extra.trace !== undefined ? { trace: extra.trace } : {}),
    timestamp: event.recordedAt,
  };
  return {
    id: `observation:${event.eventId}`,
    topic: OBSERVATION_TOPIC,
    payload: observation as unknown as Json,
  };
}

function eventIdFromOutboxId(id: string): string {
  return id.startsWith("observation:") ? id.slice("observation:".length) : id;
}

export interface DeliveryOptions {
  readonly port: ObservationPort;
  readonly backoff: { readonly baseMs: number; readonly maxMs: number; readonly maxAttempts: number };
  readonly now?: () => number;
}

/** Normal mode: at-least-once delivery from the committed outbox with persisted receipts and reconciliation status. */
export class ObservationDelivery {
  private readonly dispatcher: OutboxDispatcher;

  constructor(
    private readonly store: DurableStore,
    private readonly options: DeliveryOptions,
  ) {
    this.dispatcher = new OutboxDispatcher(store, {
      topic: OBSERVATION_TOPIC,
      backoff: options.backoff,
      now: options.now,
      deliver: async (item) => {
        const eventId = eventIdFromOutboxId(item.id);
        const observation = item.payload as unknown as Observation;
        try {
          const receipt = await options.port.record(observation);
          await this.writeStatus({
            eventId,
            observationId: observation.observationId,
            state: receipt.status,
            attempts: item.attempts,
            targetRef: receipt.targetRef,
            lastError: null,
          });
          return receipt.detail;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const poisoning = item.attempts >= options.backoff.maxAttempts;
          await this.writeStatus({
            eventId,
            observationId: observation.observationId,
            state: poisoning ? "failed" : "retrying",
            attempts: item.attempts,
            targetRef: null,
            lastError: message,
          });
          throw error;
        }
      },
    });
  }

  private async writeStatus(value: ObservationStatus): Promise<void> {
    const existing = await this.store.getRecord(OBSERVATIONS_COLLECTION, value.eventId);
    await this.store.commit({
      appends: [],
      records: [
        {
          collection: OBSERVATIONS_COLLECTION,
          id: value.eventId,
          expectedVersion: existing?.version ?? 0,
          value: value as unknown as { readonly [key: string]: Json },
        },
      ],
    });
  }

  /** Deliver available observations once; failures never touch committed framework events. */
  async drain(): Promise<{ readonly delivered: readonly string[]; readonly retried: readonly string[]; readonly failed: readonly string[] }> {
    const report = await this.dispatcher.drain();
    return {
      delivered: report.delivered.map(eventIdFromOutboxId),
      retried: report.retried.map((r) => eventIdFromOutboxId(r.id)),
      failed: report.poisoned.map(eventIdFromOutboxId),
    };
  }

  async status(eventId: string): Promise<ObservationStatus | undefined> {
    const record = await this.store.getRecord(OBSERVATIONS_COLLECTION, eventId);
    return record ? (record.value as unknown as ObservationStatus) : undefined;
  }

  /** Observations needing operator attention (poisoned deliveries). */
  async unreconciled(): Promise<ObservationStatus[]> {
    const records = await this.store.listRecords(OBSERVATIONS_COLLECTION, { state: "failed" });
    return records.map((r) => r.value as unknown as ObservationStatus);
  }

  /**
   * Strict-mode gate for a specific operation (spec §20): true only if the target accepted (or already had) the
   * observation. Queued or retrying is not enough, and acceptance is still not evidence.
   */
  async isRecorded(eventId: string): Promise<boolean> {
    const status = await this.status(eventId);
    return status?.state === "accepted" || status?.state === "duplicate";
  }
}

export { createSxrCliPort, type SxrCliOptions, type SxrWorkflow } from "./sxr-cli.ts";
