// Shared internals of one runtime instance (not exported from the package).
import type { ArtifactService } from "@cognate/artifacts";
import type { ContinuationService } from "@cognate/continuations";
import type { DurableStore, Json, OutboxIntent } from "@cognate/events";
import type { Kernel, Principal } from "@cognate/kernel-api";
import type { AgentDefinition } from "@cognate/runtime-api";
import type { Invoker } from "./invoker.ts";
import type { ActionPolicy, PendingEvent } from "./index.ts";

export interface RecallResultJson {
  readonly status: "ok" | "degraded";
  readonly items: readonly { readonly sourceRef: string; readonly score: number; readonly value: Json }[];
}

export interface Core {
  readonly store: DurableStore;
  readonly kernel: Kernel;
  readonly invoker: Invoker;
  readonly continuations: ContinuationService;
  readonly artifacts: ArtifactService;
  readonly actions: ActionPolicy;
  readonly agents: ReadonlyMap<string, AgentDefinition>;
  readonly scopeId: string;
  readonly recall: (query: { readonly text: string; readonly k: number; readonly actor: Principal; readonly tenant: string }) => Promise<RecallResultJson>;
  /** Extra outbox intents committed with each run event (RuntimeOptions.outboxFor). */
  readonly outboxFor: (event: PendingEvent) => readonly OutboxIntent[];
  /** Abort controllers of executions in progress, by run id (cancellation aborts `RunContext.signal`). */
  readonly controllers: Map<string, AbortController>;
  /** Serialize and (re-)run a run's execution; replay-safe and idempotent. */
  execute(runId: string): Promise<void>;
  /** Ask the background loop to run soon. */
  kick(): void;
}
