// Journey J-F-delegation: `[[scenario:delegate]]` calls the `subagent` tool
// (`{description: "Summarize project status", prompt: "... [[scenario:child]]"}`), which
// `agent.coding` runs as a durable child `agent.coding` run via `spawnSubagent`
// (`@cognate/profile-harness`), correlated `subagent:<parentRunId>:<toolCallId>` (this app's own
// `subagent.start` capability — `src/capabilities/subagentStart.ts`). Covers: the child run is
// actually created and completes, its output becomes the parent's tool result and the parent
// completes, the child does NOT show up in the `sessions` projection (top-level session list), and a
// restart mid-delegation resumes without spawning a duplicate child.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { LOCAL_OPERATOR, startServer, type AppServer } from "../src/server.ts";
import { bootApp, bootMockModel, withTempHome } from "./helpers.ts";

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

async function waitForCondition(check: () => Promise<boolean>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 15));
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

const CHILD_TEXT = "The fixture workspace is a tiny, clean project with a README, a greet() helper, and no pending changes.";

describe("J-F-delegation", () => {
  test("child run is created and completes, its result lands in the parent, parent completes", async () => {
    await withTempHome(async (home) => {
      const mock = await bootMockModel();
      const { app, client } = await bootApp(home);
      try {
        const workspaceDir = join(home, "ws-delegate");
        const { workspaceId } = await configureAndSelect(client, mock.port, workspaceDir);
        const sessionId = randomUUID();

        const run = await client.startRun(
          "agent.coding",
          { sessionId, workspaceId, message: "[[scenario:delegate]] delegate this now" } as never,
          { idempotencyKey: randomUUID(), correlationId: `session:${sessionId}` },
        );

        const finalRun = await waitForCompletion(app, run.runId);
        expect(finalRun.status).toBe("completed");
        const output = finalRun.output as { readonly text?: string };
        expect(output.text).toBe(`Tool result: ${CHILD_TEXT}`);

        // The `subagents` projection has one completed row for this session.
        const rows = await app.runtime.service.readProjection(LOCAL_OPERATOR, { name: "subagents" });
        const mine = rows.filter((r) => r.key.startsWith(`${sessionId}/`));
        expect(mine).toHaveLength(1);
        const row = mine[0]!.value as { readonly title: string; readonly status: string };
        expect(row.title).toBe("Summarize project status");
        expect(row.status).toBe("completed");

        // The child is a real, separate, completed run.
        const toolCallId = mine[0]!.key.split("/")[1]!;
        const childRuns = await app.runtime.service.listRuns(LOCAL_OPERATOR, { correlationId: `subagent:${run.runId}:${toolCallId}` });
        expect(childRuns).toHaveLength(1);
        expect(childRuns[0]!.status).toBe("completed");
        expect((childRuns[0]!.output as { readonly text?: string }).text).toBe(CHILD_TEXT);

        // The child must NOT appear in the top-level `sessions` projection.
        const sessionRows = await app.runtime.service.readProjection(LOCAL_OPERATOR, { name: "sessions" });
        expect(sessionRows.some((r) => r.key === childRuns[0]!.runId || r.key.includes(":sub:"))).toBe(false);
        expect(sessionRows.map((r) => r.key)).toContain(sessionId);
      } finally {
        await app.stop();
        await mock.stop();
      }
    });
  });

  test(
    "restart mid-delegation resumes without spawning a duplicate child run",
    async () => {
      await withTempHome(async (home) => {
        const mock = await bootMockModel();
        const { app, client } = await bootApp(home);
        try {
          const workspaceDir = join(home, "ws-delegate-restart");
          const { workspaceId } = await configureAndSelect(client, mock.port, workspaceDir);
          const sessionId = randomUUID();

          const run = await client.startRun(
            "agent.coding",
            { sessionId, workspaceId, message: "[[scenario:delegate]] delegate this now" } as never,
            { idempotencyKey: randomUUID(), correlationId: `session:${sessionId}` },
          );

          // Stop as soon as the parent has recorded that it spawned the child (strictly between
          // `subagent.spawned` and the parent's own completion) — restart is genuinely mid-delegation.
          await waitForCondition(async () => {
            const rows = await app.runtime.service.readProjection(LOCAL_OPERATOR, { name: "subagents" });
            return rows.some((r) => r.key.startsWith(`${sessionId}/`));
          });
          await app.stop();

          const restarted = await startServer({ port: 0, home });
          try {
            const finalRun = await waitForCompletion(restarted, run.runId);
            expect(finalRun.status).toBe("completed");
            const output = finalRun.output as { readonly text?: string };
            expect(output.text).toBe(`Tool result: ${CHILD_TEXT}`);

            const rows = await restarted.runtime.service.readProjection(LOCAL_OPERATOR, { name: "subagents" });
            const mine = rows.filter((r) => r.key.startsWith(`${sessionId}/`));
            expect(mine).toHaveLength(1); // no duplicate row from a second `subagent.spawned`
            const toolCallId = mine[0]!.key.split("/")[1]!;
            const childRuns = await restarted.runtime.service.listRuns(LOCAL_OPERATOR, {
              correlationId: `subagent:${run.runId}:${toolCallId}`,
            });
            expect(childRuns).toHaveLength(1); // exactly one child run, not a duplicate
            expect(childRuns[0]!.status).toBe("completed");
          } finally {
            await restarted.stop();
          }
        } finally {
          await mock.stop();
        }
      });
    },
    15_000,
  );
});
