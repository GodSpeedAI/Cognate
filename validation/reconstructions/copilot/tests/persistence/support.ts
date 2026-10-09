// Shared helpers for the CopilotKit reconstruction persistence suites (prompt Phases 12+14).
//
// These suites prove durable-state evidence for the reconstruction: settlement evidence must
// survive restart and be rebuildable from the event stream alone, and cognition must never be
// an authority. They drive the reconstruction's own runtime composition
// (`createRemainingJourneysApp`) at the service level — the same settlement surface the
// reconstruction's journey tests assert against — with no DOM and no reference stack.
import { Database } from "bun:sqlite";
import type { StoredEvent } from "@godspeedai/cognate-events";
import type { Caller, RuntimeService } from "@godspeedai/cognate-runtime-api";

/** The public projections `createRemainingJourneysApp` wires (remaining-journeys.ts). */
export const PROJECTION_NAMES = ["controlled-rendering", "declarative-catalog", "rich-thread", "shared-state-canvas"] as const;

/** Poll until a run reaches `status`; the reconstruction's runs settle in milliseconds, so 20 ms steps are ample. */
export async function untilRunStatus(
  service: RuntimeService,
  caller: Caller,
  runId: string,
  status: "running" | "waiting" | "completed" | "failed" | "cancelled",
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const view = await service.getRun(caller, { runId });
    if (view.status === status) return;
    if (Date.now() > deadline) throw new Error(`run ${runId} did not reach ${status} within ${timeoutMs}ms (last: ${view.status})`);
    await Bun.sleep(20);
  }
}

/** The full durable event log visible to the caller, in store position order. */
export function snapshotEvents(service: RuntimeService, caller: Caller): Promise<StoredEvent[]> {
  return Array.fromAsync(service.events(caller, {}));
}

/** The committed event evidence that must never change across restart/rebuild: envelope + payload, position order. */
export function durableFacts(events: readonly StoredEvent[]): readonly unknown[] {
  return events.map((event) => ({
    position: event.position,
    streamId: event.streamId,
    streamSequence: event.streamSequence,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
    tenant: event.tenant,
    correlationId: event.correlationId,
    causationId: event.causationId,
    runId: event.runId,
    scopeId: event.scopeId,
    payload: event.payload,
    metadata: event.metadata ?? null,
  }));
}

export function assertPositionsNeverRegress(events: readonly StoredEvent[]): void {
  for (let index = 1; index < events.length; index++) {
    if (!(events[index]!.position > events[index - 1]!.position)) {
      throw new Error(`durable event position regressed at index ${index}: ${events[index - 1]!.position} -> ${events[index]!.position}`);
    }
  }
}

/** Projection rows keyed by projection name (service-level read; public projections only). */
export async function snapshotProjections(service: RuntimeService, caller: Caller): Promise<Record<string, readonly { key: string; value: unknown }[]>> {
  const rows: Record<string, readonly { key: string; value: unknown }[]> = {};
  for (const name of PROJECTION_NAMES) rows[name] = await service.readProjection(caller, { name });
  return rows;
}

/** Runs grouped by correlation id (the reconstruction's thread identity). */
export async function snapshotRuns(service: RuntimeService, caller: Caller, correlationIds: readonly string[]): Promise<Record<string, unknown[]>> {
  const runs: Record<string, unknown[]> = {};
  for (const correlationId of correlationIds) runs[correlationId] = await service.listRuns(caller, { correlationId });
  return runs;
}

/**
 * Raw derived-state rows straight from SQLite, as byte-exact TEXT. `projection_state.value` is the
 * JSON the fold committed; comparing these strings is the strongest "identical fold" check.
 */
export function dumpDerivedRows(path: string): { state: unknown[]; checkpoints: unknown[] } {
  const db = new Database(path, { readonly: true });
  try {
    return {
      state: db.query("SELECT name, key, value FROM projection_state ORDER BY name, key").all(),
      checkpoints: db.query("SELECT name, version, position, status FROM projection_checkpoints ORDER BY name").all(),
    };
  } finally {
    db.close();
  }
}

export function countDerivedRows(path: string): { state: number; checkpoints: number } {
  const db = new Database(path, { readonly: true });
  try {
    return {
      state: (db.query("SELECT COUNT(*) AS n FROM projection_state").get() as { n: number }).n,
      checkpoints: (db.query("SELECT COUNT(*) AS n FROM projection_checkpoints").get() as { n: number }).n,
    };
  } finally {
    db.close();
  }
}

/** Operator-style deletion of every derived row, as `tests/integration/rebuild.test.ts` models it. */
export function deleteDerivedRows(path: string): void {
  const db = new Database(path);
  try {
    db.exec("DELETE FROM projection_state; DELETE FROM projection_checkpoints;");
  } finally {
    db.close();
  }
}

export function sqliteIntegrity(path: string): string {
  const db = new Database(path, { readonly: true });
  try {
    return (db.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
  } finally {
    db.close();
  }
}
