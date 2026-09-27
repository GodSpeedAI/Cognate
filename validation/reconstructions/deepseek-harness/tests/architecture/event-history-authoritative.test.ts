// Phase 8, criterion 6: event history is authoritative. A scripted journey against APP's runtime
// composition (reusing APP's own test helpers: bootMockModel + withTempHome, i.e. the deterministic
// mock model server and a SQLite store in a temp dir) covers a tool turn, a plan turn, and an
// approval. Afterwards, all projection/checkpoint state (the store's `projection_state` and
// `projection_checkpoints` tables — see packages/store-sqlite/src/schema.ts) is deleted directly and
// the app is restarted against the same SQLite file: `createRuntime`'s startup loop (packages/
// runtime-bun/src/runtime.ts) runs `ProjectionRunner.catchUp()` for every registered projection
// before returning, which rebuilds each one from position 0 since no checkpoint remains. The
// sessions/plans/subagents/workspaces projections must be identical (deep-equal, order-independent)
// before deletion and after the rebuild.
import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { LOCAL_OPERATOR, startServer, type AppServer } from "../../cognate/src/server.ts";
import { bootApp, bootMockModel, withTempHome } from "../../cognate/test/helpers.ts";

const REBUILT_PROJECTIONS = ["sessions", "plans", "subagents", "workspaces"] as const;

async function configureAndSelect(client: Awaited<ReturnType<typeof bootApp>>["client"], mockPort: number, workspaceDir: string) {
  await client.invoke("model.configure", {
    providerId: "mock",
    baseURL: `http://127.0.0.1:${mockPort}/v1`,
    protocol: "openai-compatible",
    model: "mock-model-1",
    apiKey: "",
  });
  await mkdir(workspaceDir, { recursive: true });
  return (await client.invoke("workspace.select", { path: workspaceDir })) as { readonly workspaceId: string };
}

async function waitForCondition(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("condition not met in time");
}

async function waitForCompletion(app: AppServer, runId: string) {
  for (let i = 0; i < 400; i++) {
    const run = await app.runtime.service.getRun(LOCAL_OPERATOR, { runId });
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") return run;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`run ${runId} did not complete in time`);
}

async function snapshotProjections(app: AppServer): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {};
  for (const name of REBUILT_PROJECTIONS) {
    const rows = await app.runtime.service.readProjection(LOCAL_OPERATOR, { name });
    // Sort by key so row order (an implementation detail of storage, not of the events) never
    // affects the comparison.
    snapshot[name] = [...rows].sort((a, b) => a.key.localeCompare(b.key));
  }
  return snapshot;
}

describe("Phase 8 §6: event history is authoritative (projections rebuild identically)", () => {
  test(
    "sessions/plans/subagents/workspaces are identical after deleting all projection state and rebuilding from events",
    async () => {
      await withTempHome(async (home) => {
        const mock = await bootMockModel();
        const { app, client } = await bootApp(home);
        try {
          const workspaceDir = join(home, "ws-authoritative");
          const { workspaceId } = await configureAndSelect(client, mock.port, workspaceDir);

          // 1. A tool turn.
          const toolSessionId = randomUUID();
          const toolRun = await client.startRun(
            "agent.coding",
            { sessionId: toolSessionId, workspaceId, message: "[[scenario:multi]] do the multi-step task now" } as never,
            { idempotencyKey: randomUUID(), correlationId: `session:${toolSessionId}` },
          );
          const finishedTool = await waitForCompletion(app, toolRun.runId);
          expect(finishedTool.status).toBe("completed");

          // 2. A plan turn, approved.
          const planSessionId = randomUUID();
          const planRun = await client.startRun(
            "agent.coding",
            { sessionId: planSessionId, workspaceId, message: "/plan make a plan now [[scenario:plan]]" } as never,
            { idempotencyKey: randomUUID(), correlationId: `session:${planSessionId}` },
          );
          await waitForCondition(async () => {
            const continuations = await app.runtime.service.listContinuations(LOCAL_OPERATOR, { runId: planRun.runId });
            return continuations.some((c) => c.status === "OPEN" && c.type === "plan-review");
          });
          const planContinuations = await app.runtime.service.listContinuations(LOCAL_OPERATOR, { runId: planRun.runId });
          const planReview = planContinuations.find((c) => c.status === "OPEN" && c.type === "plan-review")!;
          await client.resolveContinuation(planReview.id, "resume", { approved: true });
          const finishedPlan = await waitForCompletion(app, planRun.runId);
          expect(finishedPlan.status).toBe("completed");

          // 3. An approval turn, allowed.
          const approvalSessionId = randomUUID();
          const approvalRun = await client.startRun(
            "agent.coding",
            { sessionId: approvalSessionId, workspaceId, message: "[[scenario:approval]] run something risky" } as never,
            { idempotencyKey: randomUUID(), correlationId: `session:${approvalSessionId}` },
          );
          await waitForCondition(async () => {
            const continuations = await app.runtime.service.listContinuations(LOCAL_OPERATOR, { runId: approvalRun.runId });
            return continuations.some((c) => c.status === "OPEN");
          });
          const approvalContinuations = await app.runtime.service.listContinuations(LOCAL_OPERATOR, { runId: approvalRun.runId });
          const openApproval = approvalContinuations.find((c) => c.status === "OPEN")!;
          await client.resolveContinuation(openApproval.id, "resume", { approved: true });
          const finishedApproval = await waitForCompletion(app, approvalRun.runId);
          expect(finishedApproval.status).toBe("completed");

          // 4. A subagent delegation, so the `subagents` projection is non-trivially exercised too.
          const delegateSessionId = randomUUID();
          const delegateRun = await client.startRun(
            "agent.coding",
            { sessionId: delegateSessionId, workspaceId, message: "[[scenario:delegate]] delegate the summary" } as never,
            { idempotencyKey: randomUUID(), correlationId: `session:${delegateSessionId}` },
          );
          const finishedDelegate = await waitForCompletion(app, delegateRun.runId);
          expect(finishedDelegate.status).toBe("completed");
          // Give the fire-and-forget child a moment to complete and land in the `subagents` projection.
          await waitForCondition(async () => {
            const rows = await app.runtime.service.readProjection(LOCAL_OPERATOR, { name: "subagents" });
            return rows.some((r) => r.key.startsWith(`${delegateSessionId}:`));
          }, 15_000).catch(() => {
            // If delegation never lands (e.g. scenario timing), the snapshot below still compares
            // whatever state exists before/after rebuild — the assertion of interest is identity,
            // not that this projection is non-empty.
          });

          const before = await snapshotProjections(app);

          await app.stop();
          await mock.stop();

          // Delete all projection state and checkpoints for the four projections under test, directly
          // against the SQLite store's projection tables (packages/store-sqlite/src/schema.ts:
          // `projection_state`, `projection_checkpoints`).
          const dbPath = join(home, "app.sqlite");
          const db = new Database(dbPath);
          try {
            const placeholders = REBUILT_PROJECTIONS.map(() => "?").join(",");
            db.query(`DELETE FROM projection_state WHERE name IN (${placeholders})`).run(...REBUILT_PROJECTIONS);
            db.query(`DELETE FROM projection_checkpoints WHERE name IN (${placeholders})`).run(...REBUILT_PROJECTIONS);
          } finally {
            db.close();
          }

          // Restart: createRuntime's startup loop runs ProjectionRunner.catchUp() for every
          // registered projection before returning, rebuilding the four we reset from position 0.
          const restarted = await startServer({ port: 0, home });
          try {
            const after = await snapshotProjections(restarted);
            expect(after).toEqual(before);
          } finally {
            await restarted.stop();
          }
        } finally {
          await app.stop().catch(() => {});
          await mock.stop().catch(() => {});
        }
      });
    },
    30_000,
  );
});
