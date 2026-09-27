// `session.history`: closes over `runtime.service` (cognate-api.md §3 "History" row). Folds prior
// completed `agent.coding` runs in correlation `session:<id>` into `ModelMessage[]`. Invoked via
// `ctx.invoke` from `agent.coding`, so the fold itself is recorded and replayable.
//
// T10 (J-F-delegation): the `subagent` tool is fire-and-forget (reference-behavior-matrix.md §6.4) —
// the parent turn that spawned a child never waits on it and so cannot report the child's result as
// *its own* tool result. Per this tranche's correction, the result still "returns to the parent"
// durably, just one turn later: for each parent run in this session, any subagent it spawned that
// has since completed (the `subagents` projection, keyed `${parentRunId}/${toolCallId}`) is folded
// in as a synthetic `user`-role context message right after that run's own turn, so the *next* turn's
// model call sees the completed child's answer.
import type { ModelMessage } from "@cognate/capabilities";
import type { Component, SemanticRef } from "@cognate/kernel-api";
import type { RuntimeService } from "@cognate/runtime-api";
import type { SubagentRow } from "../projections/subagents.ts";

export interface SessionHistoryInput {
  readonly sessionId: string;
  /** Exclude this run (the run currently asking for history — it has no output yet). */
  readonly excludeRunId?: string;
}

export function sessionHistoryComponent(getService: () => RuntimeService, semanticRef?: SemanticRef): Component {
  return {
    id: "session:history",
    provides: [{ id: "session.history", version: "1.0.0", semanticRef }],
    activate(fiber) {
      fiber.provide({ id: "session.history", version: "1.0.0", semanticRef }, async (rawInput, ctx) => {
        const input = rawInput as SessionHistoryInput;
        const service = getService();
        const caller = { actor: ctx.actor, tenant: ctx.tenant ?? "local" };
        const runs = await service.listRuns(caller, { correlationId: `session:${input.sessionId}` });
        const subagentRows = await service.readProjection(caller, { name: "subagents" });
        const messages: ModelMessage[] = [];
        for (const run of runs) {
          if (run.runId === input.excludeRunId) continue;
          if (run.agent !== "agent.coding") continue;
          const runInput = run.input as { readonly message?: string };
          if (typeof runInput?.message === "string") messages.push({ role: "user", content: runInput.message });
          if (run.status === "completed") {
            const output = run.output as { readonly text?: string };
            if (typeof output?.text === "string") messages.push({ role: "assistant", content: output.text });
          }
          const children = subagentRows
            .filter((r) => r.key.startsWith(`${run.runId}/`))
            .map((r) => r.value as unknown as SubagentRow)
            .filter((r) => r.status === "completed");
          for (const child of children) {
            messages.push({ role: "user", content: `Subagent "${child.title}" completed: ${child.output ?? ""}` });
          }
        }
        return messages;
      });
    },
  };
}
