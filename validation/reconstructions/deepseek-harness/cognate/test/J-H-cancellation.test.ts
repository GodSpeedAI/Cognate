// Journey J-H-cancellation: while a run is streaming (the mock's `interrupt` scenario — a slow drip
// after a few initial words, see fixtures/mock-model/server.ts), the client cancels the run. The run
// ends `cancelled`, the mock model server actually observed the connection abort (not just an
// in-process signal flip), the partial streamed text is retained in the recorded
// `run.invocation.progress` events, and a follow-up turn in the same session still completes.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { StoredEvent } from "@cognate/events";
import { LOCAL_OPERATOR, type AppServer } from "../src/server.ts";
import { bootApp, bootMockModel, withTempHome } from "./helpers.ts";

async function waitForCompletion(app: AppServer, runId: string) {
  for (let i = 0; i < 400; i++) {
    const run = await app.runtime.service.getRun(LOCAL_OPERATOR, { runId });
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") return run;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`run ${runId} did not complete in time`);
}

async function waitForFirstTextDelta(app: AppServer, runId: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    const events: StoredEvent[] = [];
    for await (const e of app.runtime.service.events(LOCAL_OPERATOR, { runId })) events.push(e);
    const hasText = events.some(
      (e) => e.eventType === "run.invocation.progress" && (e.payload as { readonly kind?: string }).kind === "text",
    );
    if (hasText) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`run ${runId} never streamed a text delta`);
}

describe("J-H-cancellation", () => {
  test("Stop mid-stream cancels the run, the mock sees the abort, partial text is retained, and a follow-up turn completes", async () => {
    await withTempHome(async (home) => {
      const mock = await bootMockModel();
      const { app, client } = await bootApp(home);
      try {
        await client.invoke("model.configure", {
          providerId: "mock",
          baseURL: `http://127.0.0.1:${mock.port}/v1`,
          protocol: "openai-compatible",
          model: "mock-model-1",
          apiKey: "",
        });
        const workspaceDir = await mkdtemp(join(tmpdir(), "deepseek-harness-cancel-"));
        const { workspaceId } = (await client.invoke("workspace.select", { path: workspaceDir })) as { readonly workspaceId: string };

        const sessionId = randomUUID();
        const view = await client.startRun(
          "agent.coding",
          { sessionId, workspaceId, message: "[[scenario:interrupt]] please work on this" } as never,
          { idempotencyKey: randomUUID(), correlationId: `session:${sessionId}` },
        );

        // Let a few words stream in before cancelling, matching the reference's "cancellation
        // happened right after the first chunk" (reference-behavior-matrix.md §7).
        await waitForFirstTextDelta(app, view.runId);
        await client.cancelRun(view.runId, "user-cancelled");

        const finalRun = await waitForCompletion(app, view.runId);
        expect(finalRun.status).toBe("cancelled");

        // The mock model server (a real, separate HTTP process) actually observed the connection
        // close/abort — not just this app's own in-process AbortController flipping.
        const abortRes = await fetch(`http://127.0.0.1:${mock.port}/__abort-count`);
        const abortBody = (await abortRes.json()) as { readonly count: number };
        expect(abortBody.count).toBeGreaterThanOrEqual(1);

        // Partial streamed text was durably recorded (what the UI's `useStreamingTurn` renders as
        // the kept partial reply) — not discarded because the run failed to finish.
        const events: StoredEvent[] = [];
        for await (const e of app.runtime.service.events(LOCAL_OPERATOR, { runId: view.runId })) events.push(e);
        const textDeltas = events
          .filter((e) => e.eventType === "run.invocation.progress" && (e.payload as { readonly kind?: string }).kind === "text")
          .map((e) => String((e.payload as { readonly text?: string }).text ?? ""));
        expect(textDeltas.join("").length).toBeGreaterThan(0);
        // No `message.completed`/`turn.failed` for a cancelled run.
        expect(events.some((e) => e.eventType === "message.completed")).toBe(false);

        await app.runtime.idle();
        const sessionRows = await app.runtime.service.readProjection(LOCAL_OPERATOR, { name: "sessions" });
        const sessionRow = sessionRows.find((r) => r.key === sessionId)?.value as { readonly lastStatus?: string } | undefined;
        expect(sessionRow?.lastStatus).toBe("cancelled");

        // A follow-up message in the same session starts a new run and completes normally.
        const view2 = await client.startRun(
          "agent.coding",
          { sessionId, workspaceId, message: "[[scenario:plain]] try again" } as never,
          { idempotencyKey: randomUUID(), correlationId: `session:${sessionId}` },
        );
        const finalRun2 = await waitForCompletion(app, view2.runId);
        expect(finalRun2.status).toBe("completed");

        const history = (await client.invoke("session.history", { sessionId })) as { readonly role: string; readonly content: string }[];
        // The cancelled turn's user message is still part of history; its (never-completed) assistant
        // reply is not synthesized into it (see DEVIATIONS.md — "cancelled-turn history").
        expect(history.some((m) => m.role === "user" && m.content.includes("please work on this"))).toBe(true);
        expect(history.some((m) => m.role === "user" && m.content.includes("try again"))).toBe(true);
      } finally {
        await app.stop();
        await mock.stop();
      }
    });
  });
});
