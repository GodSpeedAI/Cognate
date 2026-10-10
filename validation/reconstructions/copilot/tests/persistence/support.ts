// Shared helpers for the CopilotKit reconstruction persistence suites (prompt Phases 12+14).
//
// These suites prove durable-state evidence for the reconstruction: settlement evidence must
// survive restart and be rebuildable from the event stream alone, and cognition must never be
// an authority. They drive the reconstruction's own runtime composition
// (`createRemainingJourneysApp`) at the service level — the same settlement surface the
// reconstruction's journey tests assert against — with no DOM and no reference stack.
import postgres from "postgres";
import { postgresUrl, schemaFor } from "../../cognate/src/store.ts";
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
  for (const name of PROJECTION_NAMES) rows[name] = ((await service.readProjection(caller, { name }))).rows;
  return rows;
}

/** Runs grouped by correlation id (the reconstruction's thread identity). */
export async function snapshotRuns(service: RuntimeService, caller: Caller, correlationIds: readonly string[]): Promise<Record<string, unknown[]>> {
  const runs: Record<string, unknown[]> = {};
  for (const correlationId of correlationIds) runs[correlationId] = await service.listRuns(caller, { correlationId });
  return runs;
}

/**
 * Raw derived-state rows straight from the PostgreSQL schema, as byte-exact TEXT. `value::text` is
 * the JSON the fold committed (deterministic for a given jsonb value); comparing these strings is
 * the strongest "identical fold" check. The schema is derived from the data path exactly as the
 * app's `storeConfigFor` derives it.
 */
function schemaOf(dataPath: string): string {
  return schemaFor(dataPath);
}

function poolFor(dataPath: string): postgres.Sql {
  return postgres(postgresUrl(), { max: 1, onnotice: () => {} });
}

export async function dumpDerivedRows(dataPath: string): Promise<{ state: unknown[]; checkpoints: unknown[] }> {
  const sql = poolFor(dataPath);
  const schema = schemaOf(dataPath);
  try {
    return {
      state: await sql`SELECT name, key, value::text AS value FROM ${sql(schema)}.projection_state ORDER BY name, key`,
      checkpoints: (await sql`SELECT name, version, position, status FROM ${sql(schema)}.projection_checkpoints ORDER BY name`).map((row) => ({ ...row, position: Number(row.position) })),
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function countDerivedRows(dataPath: string): Promise<{ state: number; checkpoints: number }> {
  const sql = poolFor(dataPath);
  const schema = schemaOf(dataPath);
  try {
    return {
      state: Number((await sql`SELECT COUNT(*) AS n FROM ${sql(schema)}.projection_state`)[0]!.n),
      checkpoints: Number((await sql`SELECT COUNT(*) AS n FROM ${sql(schema)}.projection_checkpoints`)[0]!.n),
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

/** Operator-style deletion of every derived row; the fold must rebuild from events alone. */
export async function deleteDerivedRows(dataPath: string): Promise<void> {
  const sql = poolFor(dataPath);
  const schema = schemaOf(dataPath);
  try {
    await sql`DELETE FROM ${sql(schema)}.projection_state`;
    await sql`DELETE FROM ${sql(schema)}.projection_checkpoints`;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

/** Store integrity for PostgreSQL: the schema's authoritative log is present and queryable. */
export async function storeIntegrity(dataPath: string): Promise<string> {
  const sql = poolFor(dataPath);
  const schema = schemaOf(dataPath);
  try {
    const rows = await sql`SELECT count(*) AS n FROM ${sql(schema)}.events`;
    return rows.length === 1 ? "ok" : "missing";
  } catch {
    return "missing";
  } finally {
    await sql.end({ timeout: 1 });
  }
}
