// `subagent.start`: this app's own implementation of the capability `@cognate/profile-harness`'s
// `spawnSubagent(ctx, id, agent, input)` invokes (`ctx.invoke("subagent.start", { agent, input, key
// })`, `profiles/harness/src/index.ts`). Not reused directly (same rationale as `README.md`'s "Why
// createRuntime, not createHarness": the packaged `subagentStartComponent` starts the child run with
// no `correlationId` at all, so a child would fall back to whatever the runtime defaults to — this
// app needs the child correlated as `subagent:<parentRunId>:<id>` specifically, both so it is
// queryable as a subagent run and so it is *excluded* from the `sessions` projection's "session:"-
// only guard (`src/projections/sessions.ts`) — children must not appear as top-level sessions.
// `spawnSubagent` itself (the two-line `ctx.invoke`/`ctx.waitFor` durable-resume helper) is still
// used as-is from `@cognate/profile-harness` in `agentCoding.ts` — only its capability dependency is
// this app's own.
import type { Json } from "@cognate/events";
import type { Component, SemanticRef } from "@cognate/kernel-api";
import type { RuntimeService } from "@cognate/runtime-api";

type SystemActor = { readonly id: string; readonly kind: "system" };

export interface SubagentStartInput {
  readonly agent: string;
  readonly input: Json;
  /** `${parentRunId}:${id}` — exactly the `key` `spawnSubagent` builds and also uses as the child
   *  run's idempotency key. */
  readonly key: string;
}

export function subagentStartComponent(options: {
  readonly getService: () => RuntimeService;
  readonly systemActor: SystemActor;
  readonly semanticRef?: SemanticRef;
}): Component {
  return {
    id: "subagent:start",
    provides: [{ id: "subagent.start", version: "1.0.0", semanticRef: options.semanticRef }],
    activate(fiber) {
      fiber.provide({ id: "subagent.start", version: "1.0.0", semanticRef: options.semanticRef }, async (rawInput, ctx) => {
        const input = rawInput as SubagentStartInput;
        const parentRunId = ctx.runId;
        // `key` is always `${parentRunId}:${id}` (spawnSubagent's own construction) — recover `id`
        // to build this app's `subagent:<parentRunId>:<id>` correlation.
        const prefix = `${parentRunId}:`;
        const id = input.key.startsWith(prefix) ? input.key.slice(prefix.length) : input.key;
        const service = options.getService();
        const view = await service.startRun(
          { actor: options.systemActor, tenant: ctx.tenant ?? "local" },
          { agent: input.agent, input: input.input, idempotencyKey: input.key, correlationId: `subagent:${parentRunId}:${id}` },
        );
        return { runId: view.runId };
      });
    },
  };
}
