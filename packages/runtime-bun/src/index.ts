import type { CognitiveIndex, Embedder, IndexDocument } from "@godspeedai/cognate-cognitive-api";
import type { DurableStore, Json, NewEvent, OutboxIntent, StoredEvent } from "@godspeedai/cognate-events";
import type { Component, Kernel, Policy, Principal } from "@godspeedai/cognate-kernel-api";
import type { Projection } from "@godspeedai/cognate-projections";
import type { AgentDefinition, Caller, RuntimeService } from "@godspeedai/cognate-runtime-api";
import type { GovernanceOptions } from "./governed-operation.ts";
import { startRuntime } from "./runtime.ts";

export { SeaForgeAuthority, buildAuthorityRequest, buildTransitionRequest, interpretDecision, interpretSettlement, type CarriedWork, type EvidenceReceipt, type RecordedTransition, type SeaForgeAuthorityOptions, type SettlementReceipt, type WorldTransitionRequest } from "./sea-forge-authority.ts";
export { ENV_ACTOR, ENV_MODE, ENV_SOCKET, ENV_WORLD, governanceFromEnv } from "./governance-env.ts";
export { Governor, isWorldRef, parseTimeoutSeconds, timeoutSecsEnforcer, validateGovernance } from "./governed-operation.ts";
export type { ApprovalReference, AuthorityReference, ApprovalState, CapabilityHooks, ConstraintEnforcer, GovernanceEscalation, Disposition, GovernanceAuthority, GovernanceConstraint, GovernanceDecision, GovernanceMode, GovernanceOptions, GovernedOperation, GovernedResult } from "./governed-operation.ts";

export interface ActionPolicy {
  /** Authorize run and continuation actions (start, cancel, resume, read artifacts). Default: deny (spec §32). */
  authorize(request: { readonly caller: Caller; readonly action: "run.start" | "run.cancel" | "continuation.resume" | "continuation.cancel" | "run.state.update" | "thread.state.read" | "thread.state.update" | "observation.record" | "remote.offer.publish" | "remote.offer.list" | "remote.offer.revoke" | "remote.offer.invoke"; readonly resource: string }): { readonly allow: boolean; readonly reason: string };
}

export interface CognitionOptions {
  readonly index: CognitiveIndex;
  readonly embedder: Embedder;
  /** Extract documents to index from committed events; defaults to indexing completed runs. */
  readonly extract?: (event: StoredEvent) => readonly IndexDocument[];
  /**
   * Whether the index survives restart with its data. When false (memory, RuVector adapter), the runtime
   * rebuilds the cognitive projection on start so the checkpoint never claims entries the index lost.
   */
  readonly persistent: boolean;
}

/** A run event about to be committed. */
export type PendingEvent = NewEvent & { readonly eventId: string; readonly streamId: string; readonly recordedAt: string };

/** Outbox topic whose items represent RealityTrace observations; `inspect` reports their observation ids. */
export const OBSERVATION_OUTBOX_TOPIC = "observation.deliver";

export interface RuntimeOptions {
  /** SQLite file path, `":memory:"` for an in-memory SQLite database, or an explicit store. */
  readonly store: string | { readonly store: DurableStore };
  /** Kernel invocation policy for capabilities (default-deny if omitted). */
  readonly policy: Policy;
  readonly actions: ActionPolicy;
  /** Governance of every consequential operation. Default `{ mode: "off" }` (local policy only) until Stage 6 wires SEA-Forge. */
  readonly governance?: GovernanceOptions;
  readonly agents: readonly AgentDefinition[];
  /** Capability-providing components mounted in the root scope. */
  readonly components?: readonly Component[];
  readonly cognition?: CognitionOptions;
  /** Projections kept current by the runtime; `public` ones are readable through the service. */
  readonly projections?: readonly { readonly projection: Projection; readonly public: boolean }[];
  /**
   * Extra outbox intents committed atomically with each run event (spec §13.1), e.g. RealityTrace observation
   * intents. Receives the event before commit: `eventId` is pre-assigned; `recordedAt` is provisional (= occurredAt).
   */
  readonly outboxFor?: (event: PendingEvent) => readonly OutboxIntent[];
  /** Background work loop interval (run execution, resume delivery, expiry). Default 10 ms. */
  readonly tickMs?: number;
  readonly system?: Principal;
}

export interface CausalChain {
  readonly correlationId: string;
  readonly runs: readonly string[];
  readonly events: readonly { readonly eventId: string; readonly eventType: string; readonly causationId: string | null; readonly componentId?: string; readonly fiberId?: string; readonly semanticRef?: Json }[];
  readonly invocations: readonly { readonly capability: string; readonly providerId: string; readonly fiberId: string; readonly decision: Json }[];
  readonly artifacts: readonly string[];
  readonly observations: readonly string[];
}

export interface Runtime {
  readonly service: RuntimeService;
  readonly kernel: Kernel;
  readonly store: DurableStore;
  /** Reconstruct machine-readable causal identity for a correlation id (spec §33, §40.M). */
  inspect(correlationId: string): Promise<CausalChain>;
  /** Clear the cognitive index and rebuild it from authoritative events (spec §3.5). */
  rebuildCognition(): Promise<void>;
  /** Erase an event payload under retention/privacy policy; derived views and the cognitive index drop it (spec §32). */
  erase(eventId: string, reason: string, actor: Principal): Promise<void>;
  /**
   * One pass over runs waiting on a governance approval: ask the authority where each approval stands, resume
   * the approved ones and cancel the rejected or expired ones. A resume only triggers revalidation; the
   * authority decides again when the run retries. Returns how many waits it acted on.
   */
  pollApprovals(): Promise<number>;
  /** Wait until background work queued so far has been processed (tests and graceful shutdown). */
  idle(timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

export function createRuntime(options: RuntimeOptions): Promise<Runtime> {
  return startRuntime(options);
}

export type { Json };
