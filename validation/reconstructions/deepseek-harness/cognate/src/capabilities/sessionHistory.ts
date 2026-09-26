// `session.history`: closes over `runtime.service` (cognate-api.md §3 "History" row). Folds prior
// completed `agent.coding` runs in correlation `session:<id>` into `ModelMessage[]`. Invoked via
// `ctx.invoke` from `agent.coding`, so the fold itself is recorded and replayable.
import type { ModelMessage } from "@cognate/capabilities";
import type { Component, SemanticRef } from "@cognate/kernel-api";
import type { RuntimeService } from "@cognate/runtime-api";

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
        }
        return messages;
      });
    },
  };
}
