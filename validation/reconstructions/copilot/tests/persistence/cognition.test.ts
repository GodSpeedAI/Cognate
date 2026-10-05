// Suite 3 — cognitive non-authority (prompt Phase 14).
//
// Phase 14 sequence: delete the RuVector index → restart → deterministic application behavior
// remains correct → authorization remains identical → threads/events remain intact → rebuild
// cognition → retrieval returns. Durable events remain truth; cognition is never an authority.
//
// How cognition is wired in this reconstruction: it is NOT wired. Neither
// `createRemainingJourneysApp` (remaining-journeys.ts) nor `createJourneyAApp` (journey.ts) nor
// the reconstruction server (server.ts) passes a `cognition` option to `createRuntime`, so no
// RuVector index exists for the reconstruction to delete and agent recall is a degraded no-op
// (`recallFor(store, undefined)` in runtime-bun/src/cognition.ts). The first test proves the
// as-built case: with no cognitive index ever present, deterministic journey behavior and
// authorization decisions are identical across restart and threads/events stay intact.
// The second test proves the general Phase 14 case at the level the reconstruction actually
// uses — the same `createRuntime` composition with the reconstruction's own agents and
// projections, plus a RuVector index wired exactly as the runtime documents it (persistent:
// false, like the RuVector adapter) — and runs the full delete → restart → rebuild sequence.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashingEmbedder } from "@cognate/cognitive-memory";
import { createRuVectorIndex } from "@cognate/cognitive-ruvector";
import { allowCapabilities } from "@cognate/kernel-api";
import { alice, bob, mallory } from "@cognate/runtime-api/conformance";
import type { AgentDefinition, Caller, Json } from "@cognate/runtime-api";
import { createRuntime, type Runtime } from "@cognate/runtime-bun";
import {
  createRemainingJourneysApp,
  JOURNEY_K_AGENT,
  journeyKAgent,
  LIVE_RECOVERY_CHUNKS,
} from "../../cognate/src/remaining-journeys.ts";
import { deterministicModelComponent, threadHistoryProjection } from "../../cognate/src/journey.ts";
import { sharedStateCanvasProjection } from "../../cognate/src/shared-state.ts";
import { durableFacts, snapshotEvents, untilRunStatus } from "./support.ts";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Authorization decisions worth comparing across phases, rendered as deterministic strings. */
async function authorizationDecisions(service: Runtime["service"]): Promise<Record<string, string>> {
  const malloryStart = await service
    .startRun(mallory, { agent: JOURNEY_K_AGENT, input: { message: "mallory turn" }, idempotencyKey: `mallory-${crypto.randomUUID()}`, correlationId: `thread:cognition-mallory-${crypto.randomUUID()}` })
    .then(
      () => "allowed",
      (error: Error) => `${error.name}: ${error.message}`,
    );
  const capabilityAllowed = await service
    .invoke(alice, { capability: "model.generate", input: { messages: [{ role: "user", content: "decision probe" }], stream: true } })
    .then(
      (value: Json) => `allowed:${text((value as { message?: { content?: unknown } }).message?.content)}`,
      (error: Error) => `${error.name}: ${error.message}`,
    );
  const capabilityDenied = await service
    .invoke(alice, { capability: "capability.not.mounted", input: null })
    .then(
      () => "allowed",
      (error: Error) => `${error.name}: ${error.message}`,
    );
  const malloryCapability = await service
    .invoke(mallory, { capability: "model.generate", input: { messages: [{ role: "user", content: "mallory capability probe" }], stream: true } })
    .then(
      (value: Json) => `allowed:${text((value as { message?: { content?: unknown } }).message?.content)}`,
      (error: Error) => `${error.name}: ${error.message}`,
    );
  return { runStartMallory: malloryStart, capabilityAllowed, capabilityDenied, malloryCapability };
}

test("the as-built reconstruction runs identically across restart with no cognitive index ever wired", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-persist-nocognition-"));
  const store = join(directory, "journey.sqlite");
  const first = await createRemainingJourneysApp(store);
  cleanup = async () => {
    await first.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const beforeService = first.runtime.service;

  // Deterministic chat behavior on the first runtime.
  const chat = await beforeService.startRun(alice, { agent: JOURNEY_K_AGENT, input: { message: "before restart" }, idempotencyKey: "nocog-chat-1", correlationId: "thread:nocognition-chat" });
  await untilRunStatus(beforeService, alice, chat.runId, "completed");
  const beforeChatOutput = (await beforeService.getRun(alice, { runId: chat.runId })).output;
  const beforeDecisions = await authorizationDecisions(beforeService);
  const beforeEvents = durableFacts(await snapshotEvents(beforeService, alice));
  const beforeThread = await beforeService.readProjection(alice, { name: "rich-thread" });

  await first.close();
  cleanup = async () => rmSync(directory, { recursive: true, force: true });

  // Restart on the same home. No cognitive index exists at any point in this test.
  const second = await createRemainingJourneysApp(store);
  cleanup = async () => {
    await second.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const afterService = second.runtime.service;
  await second.runtime.idle();

  const chat2 = await afterService.startRun(alice, { agent: JOURNEY_K_AGENT, input: { message: "after restart" }, idempotencyKey: "nocog-chat-2", correlationId: "thread:nocognition-chat-2" });
  await untilRunStatus(afterService, alice, chat2.runId, "completed");
  expect(await afterService.getRun(alice, { runId: chat2.runId })).toMatchObject({ output: beforeChatOutput });
  expect(await authorizationDecisions(afterService)).toEqual(beforeDecisions);
  expect(durableFacts(await snapshotEvents(afterService, alice)).slice(0, beforeEvents.length)).toEqual(beforeEvents);
  const afterRows = await afterService.readProjection(alice, { name: "rich-thread" });
  for (const row of beforeThread) expect(afterRows.find((candidate) => candidate.key === row.key)).toEqual(row);

  // Tenant isolation (an authorization property) is identical too: another tenant reads nothing.
  expect(await afterService.listRuns(bob, {})).toEqual([]);
  expect((await Array.fromAsync(afterService.events(bob, {}))).length).toBe(0);

  await second.close();
  cleanup = undefined;
  rmSync(directory, { recursive: true, force: true });
}, 60_000);

// ── General Phase 14 case at the reconstruction's composition level ─────────────

const PROBE_TOKENS = "qx39 settlement anchor";
const SEED_COUNT = 3;

/**
 * The recall probe. Seed mode echoes its input (so the run's output — and therefore the indexed
 * document — carries the probe tokens); probe mode recalls with the probe tokens and returns the
 * deterministic model answer plus the recalled source refs. The probe never writes the probe
 * tokens into its own output, so probe runs cannot pollute later recall results.
 */
const probeAgent: AgentDefinition = {
  id: "persistence.recall-probe",
  version: "1.0.0",
  async run(input, ctx) {
    const echo = (input as { readonly echo?: unknown }).echo;
    if (typeof echo === "string") return { echoed: echo };
    const recalled = await ctx.recall("probe", { text: PROBE_TOKENS, k: 5 });
    const response = await ctx.invoke("model.generate", { messages: [{ role: "user", content: "probe turn" }], stream: true });
    return {
      answer: text((response as { message?: { content?: unknown } }).message?.content),
      refs: recalled.items.map((item) => item.sourceRef).sort(),
    };
  },
};

type ProbeResult = { readonly answer: string; readonly refs: readonly string[] };

async function startAndAwait(service: Runtime["service"], caller: Caller, agent: string, input: Json, correlationId: string, idempotencyKey: string): Promise<Json> {
  const run = await service.startRun(caller, { agent, input, idempotencyKey, correlationId });
  await untilRunStatus(service, caller, run.runId, "completed");
  return (await service.getRun(caller, { runId: run.runId })).output;
}

/** Recall of the seed runs: the recalled refs pointing back at the seeded runs (refs are `run:<id>`). */
function seedRefs(result: ProbeResult, seedRunIds: readonly string[]): string[] {
  return result.refs.filter((ref) => seedRunIds.includes(ref.slice("run:".length)));
}

test("deleting the RuVector index changes no behavior or authorization; cognition rebuilds from events", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cognate-persist-cognition-"));
  const store = join(directory, "journey.sqlite");
  const storagePath = join(directory, "ruvector.db");
  const dimension = 64;

  // Runtime 1: the reconstruction's composition (agents, components, projections) plus cognition
  // wired as the runtime documents the RuVector adapter: persistent false.
  const index1 = await createRuVectorIndex({ dimension, storagePath });
  const first = await createRuntime({
    store,
    policy: allowCapabilities("persistence-cognition", ["model.generate"]),
    actions: {
      authorize: ({ caller }) =>
        caller.actor.id === "mallory" ? { allow: false, reason: "persistence-cognition: mallory may not start runs" } : { allow: true, reason: "persistence-cognition: allowed" },
    },
    agents: [journeyKAgent, probeAgent],
    components: [deterministicModelComponent()],
    projections: [
      { projection: threadHistoryProjection, public: true },
      { projection: sharedStateCanvasProjection, public: true },
    ],
    cognition: { index: index1, embedder: hashingEmbedder(dimension), persistent: false },
  });
  cleanup = async () => {
    await index1.close();
    await first.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const beforeService = first.service;

  // Seed completed runs whose indexed documents carry the probe tokens.
  const seedRunIds: string[] = [];
  for (let seeded = 0; seeded < SEED_COUNT; seeded++) {
    const run = await beforeService.startRun(alice, { agent: probeAgent.id, input: { echo: PROBE_TOKENS }, idempotencyKey: `cognition-seed-${seeded}`, correlationId: "thread:cognition-seed" });
    await untilRunStatus(beforeService, alice, run.runId, "completed");
    expect(await beforeService.getRun(alice, { runId: run.runId })).toMatchObject({ output: { echoed: PROBE_TOKENS } });
    seedRunIds.push(run.runId);
  }
  expect(seedRunIds).toHaveLength(SEED_COUNT);
  // The cognitive indexer folds completed runs live; idle() guarantees the seeds are indexed
  // before anything recalls against them.
  await first.idle();

  // Baseline: deterministic behavior, working retrieval, authorization decisions, thread evidence.
  const chat = await beforeService.startRun(alice, { agent: JOURNEY_K_AGENT, input: { message: "cognition baseline" }, idempotencyKey: "cognition-chat-1", correlationId: "thread:cognition-chat" });
  await untilRunStatus(beforeService, alice, chat.runId, "completed");
  const beforeChatOutput = await startAndAwait(beforeService, alice, JOURNEY_K_AGENT, { message: "unused" }, "thread:cognition-chat-2", "cognition-chat-2");
  const beforeProbe = (await startAndAwait(beforeService, alice, probeAgent.id, { query: PROBE_TOKENS }, "thread:cognition-probe", "cognition-probe-1")) as ProbeResult;
  expect(beforeProbe.answer).toBe("Hello from the deterministic Cognate chat.");
  expect(seedRefs(beforeProbe, seedRunIds)).toHaveLength(SEED_COUNT);
  const beforeDecisions = await authorizationDecisions(beforeService);
  expect(beforeDecisions.runStartMallory).toContain("mallory may not start runs");
  await beforeService.updateSharedState(alice, { threadId: "thread:cognition-shared", update: { snapshot: { todos: [{ id: "agent", text: "agent todo" }] } }, idempotencyKey: "cognition-shared-1" });
  const beforeShared = await beforeService.readSharedState(alice, { threadId: "thread:cognition-shared" });
  const beforeChatThreadRow = (await beforeService.readProjection(alice, { name: "conversation-thread-history" })).find((row) => row.key === "thread/thread:cognition-chat");
  const beforeEvents = durableFacts(await snapshotEvents(beforeService, alice));

  await first.close();
  await index1.close();

  // ── Delete the RuVector index, then restart on the same home ─────────────────
  rmSync(storagePath, { force: true });
  const index2 = await createRuVectorIndex({ dimension, storagePath });
  const second = await createRuntime({
    store,
    policy: allowCapabilities("persistence-cognition", ["model.generate"]),
    actions: {
      authorize: ({ caller }) =>
        caller.actor.id === "mallory" ? { allow: false, reason: "persistence-cognition: mallory may not start runs" } : { allow: true, reason: "persistence-cognition: allowed" },
    },
    agents: [journeyKAgent, probeAgent],
    components: [deterministicModelComponent()],
    projections: [
      { projection: threadHistoryProjection, public: true },
      { projection: sharedStateCanvasProjection, public: true },
    ],
    cognition: { index: index2, embedder: hashingEmbedder(dimension), persistent: false },
  });
  cleanup = async () => {
    await index2.close();
    await second.close();
    rmSync(directory, { recursive: true, force: true });
  };
  const afterService = second.service;
  await second.idle();

  // Deterministic behavior remains correct after the restart on the deleted index.
  const afterChatOutput = await startAndAwait(afterService, alice, JOURNEY_K_AGENT, { message: "unused" }, "thread:cognition-chat-3", "cognition-chat-3");
  expect(afterChatOutput).toEqual(beforeChatOutput);

  // Authorization remains identical: same decisions, same reasons.
  expect(await authorizationDecisions(afterService)).toEqual(beforeDecisions);

  // Threads and events remain intact: the durable log only grows, never rewrites.
  expect(durableFacts(await snapshotEvents(afterService, alice)).slice(0, beforeEvents.length)).toEqual(beforeEvents);
  expect(await afterService.readSharedState(alice, { threadId: "thread:cognition-shared" })).toEqual(beforeShared);

  // Rebuild cognition (the persistent:false startup already refolded it from the event stream;
  // rebuildCognition() makes the derivation explicit) and retrieval returns.
  await second.rebuildCognition();
  const rebuiltProbe = (await startAndAwait(afterService, alice, probeAgent.id, { query: PROBE_TOKENS }, "thread:cognition-probe", "cognition-probe-2")) as ProbeResult;
  expect(rebuiltProbe.answer).toBe(beforeProbe.answer);
  expect(seedRefs(rebuiltProbe, seedRunIds)).toHaveLength(SEED_COUNT);
  const rebuiltChatThreadRow = (await afterService.readProjection(alice, { name: "conversation-thread-history" })).find((row) => row.key === "thread/thread:cognition-chat");
  expect(rebuiltChatThreadRow).toEqual(beforeChatThreadRow);

  // Cognition is not an authority: destroying the index mid-flight leaves behavior, authorization
  // and durable evidence untouched, with retrieval gone.
  await index2.clear();
  const degradedProbe = (await startAndAwait(afterService, alice, probeAgent.id, { query: PROBE_TOKENS }, "thread:cognition-probe", "cognition-probe-3")) as ProbeResult;
  expect(degradedProbe.answer).toBe(beforeProbe.answer);
  expect(degradedProbe.refs).toEqual([]);
  expect(await authorizationDecisions(afterService)).toEqual(beforeDecisions);
  expect(durableFacts(await snapshotEvents(afterService, alice)).slice(0, beforeEvents.length)).toEqual(beforeEvents);

  // Rebuilding cognition from the durable event stream restores retrieval to the same sources.
  await second.rebuildCognition();
  const restoredProbe = (await startAndAwait(afterService, alice, probeAgent.id, { query: PROBE_TOKENS }, "thread:cognition-probe", "cognition-probe-4")) as ProbeResult;
  expect(restoredProbe.answer).toBe(beforeProbe.answer);
  expect(seedRefs(restoredProbe, seedRunIds)).toHaveLength(SEED_COUNT);
  expect(seedRefs(restoredProbe, seedRunIds).sort()).toEqual(seedRefs(beforeProbe, seedRunIds).sort());

  // The durable event log is still exactly the authoritative prefix it always was.
  expect(durableFacts(await snapshotEvents(afterService, alice)).slice(0, beforeEvents.length)).toEqual(beforeEvents);
  expect(LIVE_RECOVERY_CHUNKS.length).toBeGreaterThan(0);

  await second.close();
  await index2.close();
  cleanup = undefined;
  rmSync(directory, { recursive: true, force: true });
}, 60_000);
