// Suite 2 — rebuild from events (prompt Phase 12: "state evidence ... projections rebuild").
//
// After recording representative settlement journeys, every derived row (projection_state and
// projection_checkpoints — the only derived tables the runtime's SQLite store owns) is deleted
// wholesale, exactly as tests/integration/rebuild.test.ts models an operator losing derived
// state. A NEW runtime on the same home folds the durable event stream from position 0, and the
// suite proves the rebuilt fold is byte-for-byte identical to the pre-delete fold, that the
// authoritative event stream itself is untouched, and that journeys still replay identically.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { alice } from "@cognate/runtime-api/conformance";
import {
  CONTINUATION_MESSAGE,
  createRemainingJourneysApp,
  JOURNEY_D_AGENT,
  JOURNEY_E_AGENT,
  JOURNEY_F_AGENT,
  JOURNEY_H_AGENT,
  JOURNEY_K_AGENT,
  LIVE_RECOVERY_CHUNKS,
} from "../../cognate/src/remaining-journeys.ts";
import {
  countDerivedRows,
  deleteDerivedRows,
  dumpDerivedRows,
  durableFacts,
  snapshotEvents,
  snapshotProjections,
  snapshotRuns,
  untilRunStatus,
} from "./support.ts";

const CORRELATIONS = ["thread:rebuild-chat", "thread:rebuild-chat-2", "thread:rebuild-agent-state", "thread:rebuild-render", "thread:rebuild-declarative", "thread:rebuild-hitl", "thread:rebuild-hitl-2"] as const;

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function settleHitl(service: Awaited<ReturnType<typeof createRemainingJourneysApp>>["runtime"]["service"], correlationId: string, idempotencyKey: string) {
  const run = await service.startRun(alice, { agent: JOURNEY_F_AGENT, input: { prompt: "30-minute meeting with CopilotKit" }, idempotencyKey, correlationId });
  await untilRunStatus(service, alice, run.runId, "waiting");
  const [wait] = await service.listContinuations(alice, { runId: run.runId, status: "OPEN" });
  // The frontend-tool wait is resolved the way the connected surface resolves it: the client
  // wraps the handler result as `{ ok: true, value }` (packages/client/src/index.ts).
  await service.resolveContinuation(alice, { continuationId: wait!.id, action: "resume", input: { ok: true, value: { slot: "10:30" } }, idempotencyKey: `${idempotencyKey}-resume` });
  await untilRunStatus(service, alice, run.runId, "completed");
  return run.runId;
}

test("deleting every derived row rebuilds byte-identical folds from the durable event stream alone", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-persist-rebuild-"));
  const store = join(directory, "journey.sqlite");
  const first = await createRemainingJourneysApp(store);
  const service = first.runtime.service;
  cleanup = async () => {
    await first.close();
    rmSync(directory, { recursive: true, force: true });
  };

  // ── Representative settlement journeys on the first runtime ──────────────────
  const chat1 = await service.startRun(alice, { agent: JOURNEY_K_AGENT, input: { message: "before rebuild" }, idempotencyKey: "rebuild-chat-1", correlationId: "thread:rebuild-chat" });
  await untilRunStatus(service, alice, chat1.runId, "completed");
  const agentState = await service.startRun(alice, { agent: JOURNEY_D_AGENT, input: { context: [] }, idempotencyKey: "rebuild-agent-state-1", correlationId: "thread:rebuild-agent-state" });
  await untilRunStatus(service, alice, agentState.runId, "completed");
  const render = await service.startRun(alice, { agent: JOURNEY_E_AGENT, input: { query: "rebuild parity" }, idempotencyKey: "rebuild-render-1", correlationId: "thread:rebuild-render" });
  await untilRunStatus(service, alice, render.runId, "completed");
  const declarative = await service.startRun(alice, { agent: JOURNEY_H_AGENT, input: {}, idempotencyKey: "rebuild-declarative-1", correlationId: "thread:rebuild-declarative" });
  await untilRunStatus(service, alice, declarative.runId, "waiting");
  const [interaction] = await service.listContinuations(alice, { runId: declarative.runId, status: "OPEN" });
  await service.resolveContinuation(alice, { continuationId: interaction!.id, action: "resume", input: { region: "apac" }, idempotencyKey: "rebuild-declarative-resume" });
  await untilRunStatus(service, alice, declarative.runId, "completed");
  const hitl1 = await settleHitl(service, "thread:rebuild-hitl", "rebuild-hitl-1");
  await service.updateSharedState(alice, { threadId: "thread:rebuild-shared-caller", update: { snapshot: { todos: [{ id: "agent", text: "agent todo" }] } }, idempotencyKey: "rebuild-shared-1" });
  await service.updateSharedState(alice, {
    threadId: "thread:rebuild-shared-caller",
    update: { patch: [{ op: "add", path: "/todos/-", value: { id: "user", text: "user todo" } }] },
    idempotencyKey: "rebuild-shared-2",
    expectedVersion: 1,
  });

  // ── Baseline: folds, raw derived rows, runs, and the authoritative event log ─
  await first.runtime.idle();
  const beforeEvents = durableFacts(await snapshotEvents(service, alice));
  const beforeProjections = await snapshotProjections(service, alice);
  for (const name of Object.keys(beforeProjections)) expect(beforeProjections[name]!.length).toBeGreaterThan(0);
  const beforeRuns = await snapshotRuns(service, alice, CORRELATIONS);
  const beforeHitlOutput = (await service.getRun(alice, { runId: hitl1 })).output;
  const beforeShared = await service.readSharedState(alice, { threadId: "thread:rebuild-shared-caller" });

  // ── Operator-style deletion of every derived row ─────────────────────────────
  await first.close();
  cleanup = async () => rmSync(directory, { recursive: true, force: true });
  const before = dumpDerivedRows(store);
  expect(before.state.length).toBeGreaterThan(0);
  expect(before.checkpoints.length).toBeGreaterThan(0);
  deleteDerivedRows(store);
  expect(countDerivedRows(store)).toEqual({ state: 0, checkpoints: 0 });

  // ── A new runtime folds the durable event stream from position 0 ─────────────
  const second = await createRemainingJourneysApp(store);
  cleanup = async () => {
    await second.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const reopened = second.runtime.service;
  await second.runtime.idle();

  // The rebuilt fold is byte-for-byte identical: raw TEXT rows and checkpoints match.
  const after = dumpDerivedRows(store);
  expect(after).toEqual(before);

  // The authoritative event stream was untouched by the deletion and rebuild.
  const afterEvents = await snapshotEvents(reopened, alice);
  expect(durableFacts(afterEvents)).toEqual(beforeEvents);

  // Service-level projection reads fold to identical rows (serialization-equal).
  const afterProjections = await snapshotProjections(reopened, alice);
  for (const name of Object.keys(beforeProjections)) {
    expect(JSON.parse(JSON.stringify(afterProjections[name]))).toEqual(beforeProjections[name]);
    expect(JSON.stringify(afterProjections[name])).toBe(JSON.stringify(beforeProjections[name]));
  }

  // Runs and thread shared state were never derived: identical after the rebuild.
  expect(await snapshotRuns(reopened, alice, CORRELATIONS)).toEqual(beforeRuns);
  expect(await reopened.readSharedState(alice, { threadId: "thread:rebuild-shared-caller" })).toEqual(beforeShared);

  // ── Journeys still replay identically on the rebuilt runtime ─────────────────
  const chat2 = await reopened.startRun(alice, { agent: JOURNEY_K_AGENT, input: { message: "after rebuild" }, idempotencyKey: "rebuild-chat-2", correlationId: "thread:rebuild-chat-2" });
  await untilRunStatus(reopened, alice, chat2.runId, "completed");
  expect(await reopened.getRun(alice, { runId: chat2.runId })).toMatchObject({ output: { delivered: LIVE_RECOVERY_CHUNKS.length } });
  const hitl2 = await settleHitl(reopened, "thread:rebuild-hitl-2", "rebuild-hitl-2");
  expect(await reopened.getRun(alice, { runId: hitl2 })).toMatchObject({ output: beforeHitlOutput });
  const hitl2Events = await Array.fromAsync(reopened.events(alice, { runId: hitl2 }));
  expect(hitl2Events.find((event) => event.eventType === "message.delta")?.payload).toEqual({ text: CONTINUATION_MESSAGE });

  // The twin threads fold identically apart from their thread identity.
  const richRows = await reopened.readProjection(alice, { name: "rich-thread" });
  const [row1, row2] = [richRows.find((row) => row.key === "thread/thread:rebuild-chat"), richRows.find((row) => row.key === "thread/thread:rebuild-chat-2")];
  expect(row1).toBeDefined();
  expect({ ...row2!.value, threadId: row1!.value.threadId }).toEqual(row1!.value);
  expect(row1!.value.status).toBe("completed");

  // The rebuilt folds kept up with the replayed journeys (positions still never regress).
  const finalEvents = await snapshotEvents(reopened, alice);
  expect(finalEvents.length).toBeGreaterThan(afterEvents.length);
  for (let index = 1; index < finalEvents.length; index++) expect(finalEvents[index]!.position).toBeGreaterThan(finalEvents[index - 1]!.position);

  await second.close();
  cleanup = undefined;
  rmSync(directory, { recursive: true, force: true });
}, 60_000);
