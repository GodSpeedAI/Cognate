// Suite 1 — restart survival (prompt Phase 12, settlement gates 16/17/29/30 support).
//
// Representative reconstruction journeys (chat turn, shared-state write, HITL tool decision,
// runtime interrupt resolution) run against an in-process runtime on a temp home. The runtime is
// closed cleanly and a NEW runtime is opened on the SAME home, and the suite proves:
//   - threads and full message history survive (durable events + the rich-thread fold);
//   - projections fold to identical rows;
//   - thread shared state survives (same state and version);
//   - waiting and resolved continuations survive with their states (OPEN / RESUMED / CANCELLED);
//   - durable event positions never regress;
//   - a settled remote-capability offer is never reauthorized on replay.
// A clean close is not crash recovery, so a second test kills the process (SIGKILL, no close)
// and proves the durable wait survives and is resumable, as tests/integration/crash.test.ts does.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { alice } from "@godspeedai/cognate-runtime-api/conformance";
import {
  CONTINUATION_MESSAGE,
  createRemainingJourneysApp,
  JOURNEY_D_AGENT,
  JOURNEY_E_AGENT,
  JOURNEY_F_AGENT,
  JOURNEY_G_AGENT,
  JOURNEY_H_AGENT,
  JOURNEY_J_AGENT,
  JOURNEY_K_AGENT,
  RICH_THREAD_MESSAGE,
} from "../../cognate/src/remaining-journeys.ts";
import {
  assertPositionsNeverRegress,
  durableFacts,
  snapshotEvents,
  snapshotProjections,
  snapshotRuns,
  sqliteIntegrity,
  untilRunStatus,
} from "./support.ts";

const THREAD_INSPECT_CONTRACT = { id: "thread.inspect", version: "1.0.0" } as const;

const CORRELATIONS = [
  "thread:restart-chat",
  "thread:restart-chat-2",
  "thread:restart-rich",
  "thread:restart-agent-state",
  "thread:restart-render",
  "thread:restart-declarative",
  "thread:restart-hitl",
  "thread:restart-interrupt-cancel",
  "thread:restart-interrupt-resume",
  "thread:restart-interrupt-open",
] as const;

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function startInterrupt(service: Awaited<ReturnType<typeof createRemainingJourneysApp>>["runtime"]["service"], reason: string, correlationId: string, idempotencyKey: string) {
  const run = await service.startRun(alice, { agent: JOURNEY_G_AGENT, input: { reason }, idempotencyKey, correlationId });
  await untilRunStatus(service, alice, run.runId, "waiting");
  const [open] = await service.listContinuations(alice, { runId: run.runId, status: "OPEN" });
  expect(open).toMatchObject({ type: "run-interrupt", status: "OPEN", condition: { kind: "interrupt", source: "runtime" }, payload: { reason } });
  return { runId: run.runId, continuationId: open!.id };
}

test("reconstruction settlement survives a clean restart on the same home", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-persist-restart-"));
  const store = join(directory, "journey.sqlite");
  const first = await createRemainingJourneysApp(store);
  const service = first.runtime.service;
  cleanup = async () => {
    await first.close();
    rmSync(directory, { recursive: true, force: true });
  };

  // ── Representative journeys against the first runtime ────────────────────────
  // Chat turn: the J-K agent commits message deltas to a thread (the AG-UI chat surface drives
  // this same agent; service-level startRun is its settlement path).
  const chat = await service.startRun(alice, { agent: JOURNEY_K_AGENT, input: { message: "chat before restart" }, idempotencyKey: "restart-chat-1", correlationId: "thread:restart-chat" });
  await untilRunStatus(service, alice, chat.runId, "completed");

  // Rich thread with a mounted frontend offer: the offer is revoked before restart so the
  // replayed settlement can never be reauthorized.
  const offer = await service.publishRemoteOffer(alice, {
    leaseId: crypto.randomUUID(),
    agent: JOURNEY_J_AGENT,
    contract: THREAD_INSPECT_CONTRACT,
    description: "Inspect the mounted thread",
    inputSchema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] },
    outputSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
    ttlMs: 60_000,
  });
  const rich = await service.startRun(alice, { agent: JOURNEY_J_AGENT, input: { message: RICH_THREAD_MESSAGE }, idempotencyKey: "restart-rich-1", correlationId: "thread:restart-rich" });
  await untilRunStatus(service, alice, rich.runId, "waiting");
  // The mounted offer's invocation is a durable continuation. The offering party settles it the
  // way the connected client engine does: resume with `{ ok: true, value }` (the offer handler's
  // result). Nothing here is React-local; the settlement is committed before the run continues.
  const [remoteWait] = await service.listContinuations(alice, { runId: rich.runId, status: "OPEN" });
  expect(remoteWait).toMatchObject({ type: `remote:${THREAD_INSPECT_CONTRACT.id}`, condition: { kind: "frontend_capability" } });
  await service.resolveContinuation(alice, { continuationId: remoteWait!.id, action: "resume", input: { ok: true, value: { summary: "inspected by a mounted surface" } }, idempotencyKey: "restart-rich-invoke" });
  await untilRunStatus(service, alice, rich.runId, "completed");
  expect(await service.getRun(alice, { runId: rich.runId })).toMatchObject({ output: { offers: [expect.any(String)], tool: { summary: "inspected by a mounted surface" } } });
  await service.revokeRemoteOffer(alice, { offerId: offer.id });
  expect(await service.listRemoteOffers(alice, { agent: JOURNEY_J_AGENT })).toEqual([]);

  // Agent-side shared-state write (J-D writes agent-writable thread state).
  const agentState = await service.startRun(alice, { agent: JOURNEY_D_AGENT, input: { context: [] }, idempotencyKey: "restart-agent-state-1", correlationId: "thread:restart-agent-state" });
  await untilRunStatus(service, alice, agentState.runId, "completed");

  // Controlled rendering run (J-E folds ui.render events into a run-scoped projection).
  const render = await service.startRun(alice, { agent: JOURNEY_E_AGENT, input: { query: "restart parity" }, idempotencyKey: "restart-render-1", correlationId: "thread:restart-render" });
  await untilRunStatus(service, alice, render.runId, "completed");

  // Declarative A2UI run (J-H): the catalog-validated render folds, the refused one does not,
  // and the declared interaction is resolved by resume.
  const declarative = await service.startRun(alice, { agent: JOURNEY_H_AGENT, input: {}, idempotencyKey: "restart-declarative-1", correlationId: "thread:restart-declarative" });
  await untilRunStatus(service, alice, declarative.runId, "waiting");
  const [interaction] = await service.listContinuations(alice, { runId: declarative.runId, status: "OPEN" });
  expect(interaction).toMatchObject({ type: "a2ui:select-region", condition: { kind: "declarative_operation", component: "SalesDashboard", operation: "select-region" } });
  await service.resolveContinuation(alice, { continuationId: interaction!.id, action: "resume", input: { region: "apac" }, idempotencyKey: "restart-declarative-resume" });
  await untilRunStatus(service, alice, declarative.runId, "completed");
  expect(await service.getRun(alice, { runId: declarative.runId })).toMatchObject({ output: { region: "apac" } });

  // HITL tool decision: wait, then a human resumes with a slot.
  const hitl = await service.startRun(alice, { agent: JOURNEY_F_AGENT, input: { prompt: "30-minute meeting with CopilotKit" }, idempotencyKey: "restart-hitl-1", correlationId: "thread:restart-hitl" });
  await untilRunStatus(service, alice, hitl.runId, "waiting");
  const [hitlWait] = await service.listContinuations(alice, { runId: hitl.runId, status: "OPEN" });
  expect(hitlWait).toMatchObject({ type: "frontend:schedule.meeting", condition: { kind: "frontend_capability", capability: "schedule.meeting" } });
  await service.resolveContinuation(alice, { continuationId: hitlWait!.id, action: "resume", input: { ok: true, value: { slot: "10:30" } }, idempotencyKey: "restart-hitl-resume" });
  await untilRunStatus(service, alice, hitl.runId, "completed");
  expect(await service.getRun(alice, { runId: hitl.runId })).toMatchObject({ output: { decision: { slot: "10:30" }, continued: true } });
  const hitlEvents = await Array.fromAsync(service.events(alice, { runId: hitl.runId }));
  expect(hitlEvents.find((event) => event.eventType === "message.delta")?.payload).toEqual({ text: CONTINUATION_MESSAGE });

  // Runtime interrupts: one cancelled, one resumed, one left OPEN across the restart.
  const interruptCancel = await startInterrupt(service, "operator abandoned this branch", "thread:restart-interrupt-cancel", "restart-interrupt-cancel-1");
  await service.resolveContinuation(alice, { continuationId: interruptCancel.continuationId, action: "cancel", reason: "operator cancelled", idempotencyKey: "restart-interrupt-cancel" });
  await untilRunStatus(service, alice, interruptCancel.runId, "failed");
  const interruptResume = await startInterrupt(service, "operator paused for review", "thread:restart-interrupt-resume", "restart-interrupt-resume-1");
  await service.resolveContinuation(alice, { continuationId: interruptResume.continuationId, action: "resume", input: { note: "reviewed and resumed" }, idempotencyKey: "restart-interrupt-resume" });
  await untilRunStatus(service, alice, interruptResume.runId, "completed");
  const interruptOpen = await startInterrupt(service, "still open across restart", "thread:restart-interrupt-open", "restart-interrupt-open-1");

  // Caller-side shared-state writes on their own thread (the J-C settlement path).
  const firstWrite = await service.updateSharedState(alice, { threadId: "thread:restart-shared-caller", update: { snapshot: { todos: [{ id: "agent", text: "agent todo" }] } }, idempotencyKey: "restart-shared-1" });
  expect(firstWrite).toEqual({ state: { todos: [{ id: "agent", text: "agent todo" }] }, version: 1 });
  const secondWrite = await service.updateSharedState(alice, {
    threadId: "thread:restart-shared-caller",
    update: { patch: [{ op: "add", path: "/todos/-", value: { id: "user", text: "user todo" } }] },
    idempotencyKey: "restart-shared-2",
    expectedVersion: 1,
  });
  expect(secondWrite).toEqual({ state: { todos: [{ id: "agent", text: "agent todo" }, { id: "user", text: "user todo" }] }, version: 2 });

  // ── Baseline settlement evidence ─────────────────────────────────────────────
  await first.runtime.idle();
  const baselineEvents = await snapshotEvents(service, alice);
  const beforeEvents = durableFacts(baselineEvents);
  expect(beforeEvents.length).toBeGreaterThan(0);
  const lastPositionBefore = baselineEvents.at(-1)!.position;
  assertPositionsNeverRegress(baselineEvents);
  const beforeProjections = await snapshotProjections(service, alice);
  for (const name of Object.keys(beforeProjections)) expect(beforeProjections[name]!.length).toBeGreaterThan(0);
  const beforeRuns = await snapshotRuns(service, alice, CORRELATIONS);
  const beforeContinuations = await service.listContinuations(alice, {});
  const beforeShared = {
    caller: await service.readSharedState(alice, { threadId: "thread:restart-shared-caller" }),
    agent: await service.readSharedState(alice, { threadId: "thread:restart-agent-state" }),
  };

  // ── Clean close, then a NEW runtime on the SAME home ─────────────────────────
  await first.close();
  cleanup = async () => rmSync(directory, { recursive: true, force: true });
  const second = await createRemainingJourneysApp(store);
  cleanup = async () => {
    await second.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const reopened = second.runtime.service;
  await second.runtime.idle();

  // Durable events: the reopened log begins with exactly the pre-restart log, positions intact.
  const afterEvents = await snapshotEvents(reopened, alice);
  expect(durableFacts(afterEvents).slice(0, beforeEvents.length)).toEqual(beforeEvents);
  assertPositionsNeverRegress(afterEvents);

  // Projections fold to identical rows (serialization-equal, not merely deep-equal).
  const afterProjections = await snapshotProjections(reopened, alice);
  for (const name of Object.keys(beforeProjections)) {
    expect(JSON.parse(JSON.stringify(afterProjections[name]))).toEqual(beforeProjections[name]);
    expect(JSON.stringify(afterProjections[name])).toBe(JSON.stringify(beforeProjections[name]));
  }

  // Runs, continuations and thread shared state survive with identical states.
  expect(await snapshotRuns(reopened, alice, CORRELATIONS)).toEqual(beforeRuns);
  expect(await reopened.listContinuations(alice, {})).toEqual(beforeContinuations);
  expect(await reopened.readSharedState(alice, { threadId: "thread:restart-shared-caller" })).toEqual(beforeShared.caller);
  expect(await reopened.readSharedState(alice, { threadId: "thread:restart-agent-state" })).toEqual(beforeShared.agent);

  // The revoked offer stays revoked: the replayed rich thread needs no reauthorization.
  expect(await reopened.listRemoteOffers(alice, { agent: JOURNEY_J_AGENT })).toEqual([]);

  // The OPEN interrupt survived and is resumable from the reopened runtime.
  const [stillOpen] = await reopened.listContinuations(alice, { runId: interruptOpen.runId, status: "OPEN" });
  expect(stillOpen!.id).toBe(interruptOpen.continuationId);
  await reopened.resolveContinuation(alice, { continuationId: interruptOpen.continuationId, action: "resume", input: { note: "resumed after restart" }, idempotencyKey: "restart-interrupt-open-resume" });
  await untilRunStatus(reopened, alice, interruptOpen.runId, "completed");
  expect(await reopened.getRun(alice, { runId: interruptOpen.runId })).toMatchObject({ output: { resumed: true, resolution: { note: "resumed after restart" } } });

  // New settlement appends beyond the pre-restart positions: durable positions never regress.
  const chat2 = await reopened.startRun(alice, { agent: JOURNEY_K_AGENT, input: { message: "chat after restart" }, idempotencyKey: "restart-chat-2", correlationId: "thread:restart-chat-2" });
  await untilRunStatus(reopened, alice, chat2.runId, "completed");
  await second.runtime.idle();
  const finalEvents = await snapshotEvents(reopened, alice);
  assertPositionsNeverRegress(finalEvents);
  expect(durableFacts(finalEvents).slice(0, beforeEvents.length)).toEqual(beforeEvents);
  for (const event of finalEvents.slice(beforeEvents.length)) expect(event.position).toBeGreaterThan(lastPositionBefore);
  const resumedEvents = await Array.fromAsync(reopened.events(alice, { runId: interruptOpen.runId }));
  const waitingAt = resumedEvents.find((event) => event.eventType === "run.waiting")!.position;
  const resumedAt = resumedEvents.find((event) => event.eventType === "run.resumed")!.position;
  expect(resumedAt).toBeGreaterThan(waitingAt);

  await second.close();
  cleanup = undefined;
  rmSync(directory, { recursive: true, force: true });
}, 60_000);

test("a process killed without close leaves durable settlement intact and resumable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-persist-crash-"));
  try {
    const store = join(directory, "journey.sqlite");
    // The child opens the reconstruction runtime itself, commits a run that is durably waiting on
    // a runtime interrupt, and then blocks forever. The parent SIGKILLs it — no close, no stop.
    const modulePath = fileURLToPath(new URL("../../cognate/src/remaining-journeys.ts", import.meta.url));
    const childPath = join(directory, "crash-child.ts");
    writeFileSync(
      childPath,
      `import { createRemainingJourneysApp, JOURNEY_G_AGENT } from ${JSON.stringify(modulePath)};
const alice = { actor: { id: "alice", kind: "user" }, tenant: "tenant-a" };
const app = await createRemainingJourneysApp(${JSON.stringify(store)});
const run = await app.runtime.service.startRun(alice, { agent: JOURNEY_G_AGENT, input: { reason: "crash while waiting" }, idempotencyKey: "crash-open-1", correlationId: "thread:crash-interrupt" });
for (;;) {
  const view = await app.runtime.service.getRun(alice, { runId: run.runId });
  if (view.status === "waiting") {
    const [open] = await app.runtime.service.listContinuations(alice, { runId: run.runId, status: "OPEN" });
    if (open) {
      console.log("CRASHREADY " + JSON.stringify({ runId: run.runId, continuationId: open.id }));
      await new Promise(() => {});
    }
  }
  await Bun.sleep(20);
}
`,
    );
    const proc = Bun.spawn(["bun", childPath], { stdout: "pipe", stderr: "pipe" });
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let ready: { runId: string; continuationId: string } | undefined;
    const deadline = Date.now() + 20_000;
    while (!ready && Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const line = buffer.split("\n").find((entry) => entry.startsWith("CRASHREADY "));
      if (line) ready = JSON.parse(line.slice("CRASHREADY ".length)) as { runId: string; continuationId: string };
    }
    if (!ready) {
      proc.kill("SIGKILL");
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`crash child never reached a durable wait: ${stderr.slice(0, 2000)}`);
    }
    proc.kill("SIGKILL");
    await proc.exited;

    // The store survives the kill intact, and the committed wait is still there.
    expect(sqliteIntegrity(store)).toBe("ok");
    const reopened = await createRemainingJourneysApp(store);
    const service = reopened.runtime.service;
    const events = await snapshotEvents(service, alice);
    assertPositionsNeverRegress(events);
    const crashEvents = events.filter((event) => event.runId === ready!.runId);
    expect(crashEvents.map((event) => event.eventType)).toEqual(expect.arrayContaining(["run.started", "run.waiting"]));
    expect(await service.getRun(alice, { runId: ready.runId })).toMatchObject({ status: "waiting", waitingOn: [ready.continuationId] });
    const [open] = await service.listContinuations(alice, { runId: ready.runId, status: "OPEN" });
    expect(open).toMatchObject({ id: ready.continuationId, type: "run-interrupt", status: "OPEN", payload: { reason: "crash while waiting" } });

    // The durable wait is resumable by the new process: settlement completes after the crash.
    await service.resolveContinuation(alice, { continuationId: ready.continuationId, action: "resume", input: { note: "resumed after crash" }, idempotencyKey: "crash-resume-1" });
    await untilRunStatus(service, alice, ready.runId, "completed");
    expect(await service.getRun(alice, { runId: ready.runId })).toMatchObject({ output: { resumed: true, resolution: { note: "resumed after crash" } } });
    const settled = await Array.fromAsync(service.events(alice, { runId: ready.runId }));
    const waitingAt = settled.find((event) => event.eventType === "run.waiting")!.position;
    const resumedAt = settled.find((event) => event.eventType === "run.resumed")!.position;
    expect(resumedAt).toBeGreaterThan(waitingAt);

    await reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
