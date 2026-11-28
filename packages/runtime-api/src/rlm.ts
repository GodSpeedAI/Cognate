// Provider-independent recursive-execution (RLM) contract (CognitiveOS convergence, design D1/D2/D5).
//
// This module owns the *public capability vocabulary* (`rlm.providers|invoke|inspect|cancel`), the
// internal `RlmProvider` port, and the host-implemented `StdioSpawnPort`. It carries no provider
// flags, env names, framing, file names or version ranges: those live in a provider's own package
// (design D7). No vendor name appears here, and a test asserts that.
import type { Json } from "@godspeedai/cognate-events";
import type { Currency } from "./assignment.ts";
import type { CaseContext, RunContext } from "./types.ts";

// ── Capability-fact vocabulary ──────────────────────────────────────────────────
// These literal sets mirror Gauntlet's agent-runner port so the two cannot drift
// (crates/gauntlet-ports/src/agent_runner.rs:162-229); `packages/runtime-api/test/rlm.test.ts`
// pins them. `return` is Cognate's spelling of Gauntlet's `return_value`.

/** Containment ladder (Gauntlet `Isolation`); declaration order is the ladder. */
export const ISOLATION_LEVELS = ["none", "process", "container", "vm"] as const;
export type RlmIsolation = (typeof ISOLATION_LEVELS)[number];

/** How a provider delivers its result (Gauntlet `ResultDelivery`; `return` = `return_value`). */
export const RESULT_DELIVERIES = ["file", "mailbox", "return"] as const;
export type RlmResultDelivery = (typeof RESULT_DELIVERIES)[number];

/** How a provider is cancelled (Gauntlet has no separate enum; the port's process control). */
export const CANCELLATIONS = ["process", "none"] as const;
export type RlmCancellation = (typeof CANCELLATIONS)[number];

/** Whether the provider reports what it spent. */
export const PAYMENT_METERING = ["reported", "unreported"] as const;
export type RlmPaymentMetering = (typeof PAYMENT_METERING)[number];

/** How the child's authority is restricted (design D8): a governed port, a tool bridge, or neither. */
export const TOOL_POLICIES = ["bridge-only", "contained", "unattested"] as const;
export type RlmToolPolicy = (typeof TOOL_POLICIES)[number];

/** The capability-fact fields a provider reports (design D2 `ProviderFacts.capabilities`). */
export const PROVIDER_FACTS = [
  "maxDepth",
  "contextDecomposition",
  "providerInternalSubagents",
  "streaming",
  "isolation",
  "resultDelivery",
  "cancellation",
  "paymentMetering",
] as const;
export type ProviderFact = (typeof PROVIDER_FACTS)[number];

// ── Invocation status (design D1 `rlm.inspect`) ─────────────────────────────────

/** Lifecycle of one invocation. `admitted|running` are open; the four terminal states never change. */
export const INVOCATION_STATUSES = ["admitted", "running", "completed", "failed", "timedOut", "cancelled", "unknown"] as const;
export type RlmInvocationStatus = (typeof INVOCATION_STATUSES)[number];

/** The terminal states; once reached, an invocation reports the same status forever (D4.7). */
export const TERMINAL_INVOCATION_STATUSES = ["completed", "failed", "timedOut", "cancelled"] as const;
export type RlmTerminalStatus = (typeof TERMINAL_INVOCATION_STATUSES)[number];

/** `unknown` is deliberately NOT terminal: an unresolved effect is not a settled one (D4.7). */
export function isTerminalInvocationStatus(status: RlmInvocationStatus): status is RlmTerminalStatus {
  return (TERMINAL_INVOCATION_STATUSES as readonly string[]).includes(status);
}

// ── Refusal codes (design D5) ───────────────────────────────────────────────────

/** Every typed refusal `rlm.*` can raise. A refusal never silently narrows or falls back. */
export const RLM_REFUSAL_CODES = [
  "rlm-provider-unknown",
  "rlm-provider-unavailable",
  "rlm-posture-refused",
  "rlm-authority-exceeds-parent",
  "rlm-depth-exceeded",
  "rlm-budget-unverifiable",
  "rlm-containment-unavailable",
  "rlm-port-unavailable",
  "rlm-egress-uncontrolled",
  "rlm-context-digest-mismatch",
  "rlm-invocation-unknown",
  "rlm-invocation-ambiguous",
  "rlm-top-level-invocation",
  /** Additive (#113): an attempt that is invalid, already holds its identity, or follows an unresolved attempt of the same task. */
  "rlm-attempt-refused",
] as const;
export type RlmRefusalCode = (typeof RLM_REFUSAL_CODES)[number];

// ── Capability ids ──────────────────────────────────────────────────────────────

/** The four provider-neutral public capabilities (design D1). No vendor name may appear in an id. */
export const RLM_CAPABILITIES = {
  providers: "rlm.providers",
  invoke: "rlm.invoke",
  inspect: "rlm.inspect",
  cancel: "rlm.cancel",
} as const;
export type RlmCapability = (typeof RLM_CAPABILITIES)[keyof typeof RLM_CAPABILITIES];

/** The agent every invocation's child run executes. */
export const RLM_AGENT_ID = "agent.rlm";

// ── Provider facts and discovery (design D1/D2) ─────────────────────────────────

export interface ProviderCapabilities {
  readonly maxDepth: number;
  readonly contextDecomposition: boolean;
  readonly providerInternalSubagents: boolean;
  readonly streaming: boolean;
  readonly isolation: RlmIsolation;
  readonly resultDelivery: RlmResultDelivery;
  readonly cancellation: RlmCancellation;
  readonly paymentMetering: RlmPaymentMetering;
}

/** The provider build identity, when it has a single executable. `null` when it has none to declare. */
export interface RlmExecutable {
  readonly version: string;
  readonly sha256: string;
}

/** The port-governance declaration (design D8): the second admission route. */
export interface PortGovernance {
  readonly world: "contained-streaming" | "local";
  readonly reach: {
    readonly filesystem: "workspace-ro" | "workspace-rw" | "none";
    readonly network: "none" | "proxied" | "host-mediated" | "open";
    readonly process: "group-kill" | "uncontrolled";
    readonly lifetime: "parent-death";
  };
  readonly evidence: "fs-diff" | "process-ledger" | "none";
  /** Required when `reach.network !== "none"`. */
  readonly egress?: {
    readonly via: "unix-socket" | "loopback-proxy";
    readonly destinations: readonly string[];
  };
}

/** What an internal provider port returns from `probe()` (design D2). */
export interface ProviderFacts {
  readonly capabilities: ProviderCapabilities;
  readonly toolPolicy: RlmToolPolicy;
  readonly executable: RlmExecutable | null;
}

/** One provider as reported by `rlm.providers`: facts plus its configured standing. */
export interface RlmProviderView {
  readonly id: string;
  readonly label: string;
  readonly capabilities: ProviderCapabilities;
  readonly toolPolicy: RlmToolPolicy;
  readonly portGovernance?: PortGovernance;
  readonly executable: RlmExecutable | null;
  readonly status: "available" | "unavailable";
  /** Present exactly when `status === "unavailable"`. */
  readonly reason?: string;
}

/** The honest admission table for this host (design D1); prose is not a substitute. */
export interface RlmAdmission {
  readonly governance: "on" | "off";
  readonly posture: "contained" | "uncontained-local";
  readonly externalProvider: "admitted" | "refused";
  readonly refusalCode?: RlmRefusalCode;
}

export interface RlmProvidersOutput {
  readonly providers: readonly RlmProviderView[];
  readonly admission: RlmAdmission;
}

// ── rlm.invoke ──────────────────────────────────────────────────────────────────

/** The parent lineage a caller attests to; recorded as declared and re-checked at the seam (D4.3/4). */
export interface RlmInvocationParent {
  /** Must equal the handler's `ctx.runId`; a top-level invocation is impossible (D4.1). */
  readonly runId: string;
  readonly assignmentId: string | null;
  readonly attempt: number;
  /** The parent's depth; the child is `depth + 1`. */
  readonly depth: number;
  readonly maxDepth: number;
  /** The parent's frozen grant, as the caller knows it. */
  readonly authorityTools: readonly string[];
}

export interface RlmTask {
  readonly purpose: string;
  readonly acceptance: readonly string[];
  readonly contextRefs: readonly string[];
  /**
   * sha256 over the canonical *resolved* artifacts. DECLARED by the caller: the runtime has no resolver for `contextRefs`, so it does
   * not verify this value and does not use it to decide whether two invocations are the same job (DEBT-037).
   */
  readonly contextDigest: string;
}

export interface RlmAuthority {
  readonly tools: readonly string[];
  readonly mode: "read-only" | "workspace-write";
}

export interface RlmBudget {
  /** Cognate's `Currency` vocabulary. */
  readonly currency: Currency;
  readonly limit: number | "unknown";
  /** Required when `limit` is numeric; without it the seam cannot consult the reservation (D4.5). */
  readonly reservationRef?: string;
}

export interface RlmInvokeInput {
  /** Stable across retries; a new attempt uses a new id (D4.8). */
  readonly invocationId: string;
  readonly providerId: string;
  readonly parent: RlmInvocationParent;
  readonly task: RlmTask;
  readonly authority: RlmAuthority;
  readonly budget: RlmBudget;
  /**
   * Additive (#113). The attempt identity recorded with the dispatch intent; default 1. One (invocationId,
   * attempt) is dispatched to a provider at most once. Reusing an `invocationId` with a different attempt is
   * refused: a retry needs a new `invocationId` (D4.8) with its own grant and `reservationRef`.
   */
  readonly attempt?: number;
  /** Mirrors the published `CaseContext` exactly; no new field is added to it (D1). */
  readonly caseContext?: CaseContext;
}

export interface RlmInvokeOutput {
  readonly invocationId: string;
  readonly runId: string;
  readonly status: "admitted";
}

// ── rlm.inspect / rlm.cancel ────────────────────────────────────────────────────

export interface RlmPayment {
  readonly currency: string;
  readonly spent: number | "unknown";
  /** How the amount was established (e.g. `provider-reported`, `unmeasured`). */
  readonly basis: string;
}

export interface RlmInspectInput {
  readonly invocationId: string;
  /** The parent run that owns the invocation. Defaults to the handler's `ctx.runId`. */
  readonly parentRunId?: string;
}

export interface RlmInspectOutput {
  readonly status: RlmInvocationStatus;
  readonly resultRef?: string;
  readonly evidence: readonly string[];
  readonly payment: RlmPayment;
  readonly providerId: string;
  /** What was *actually* used, never what was requested. */
  readonly isolation: RlmIsolation;
  readonly lastEventAt: string;
  /** Additive (#113). Present and true when an operator reconciled an ambiguous invocation: the result is not plain provider success. */
  readonly reconciled?: boolean;
}

export interface RlmCancelInput {
  readonly invocationId: string;
  readonly reason: string;
  /** The parent run that owns the invocation. Defaults to the handler's `ctx.runId`. */
  readonly parentRunId?: string;
}

export interface RlmCancelOutput {
  readonly status: "cancelled" | "already-terminal";
  /** Additive (#113), present on `cancelled`: whether a dispatch intent existed and what the provider's own cancel did. */
  readonly dispatched?: boolean;
  readonly providerCancel?: "not-dispatched" | "cancelled" | "failed";
  readonly error?: string;
}

// ── Internal provider port (never a cross-product contract; design D2/D7) ───────

/** The invocation as handed to a provider. Provider-specific flags live in the provider's package. */
export interface RlmInvokeRequest {
  readonly invocationId: string;
  readonly providerId: string;
  /** The parent run id. The child run id is not known until the provider runs (`ctx.runId`). */
  readonly runId: string;
  /** The child's depth (`parent.depth + 1`). */
  readonly depth: number;
  readonly maxDepth: number;
  readonly task: RlmTask;
  readonly authority: RlmAuthority;
  readonly budget: RlmBudget;
  /** Additive (#113): the attempt identity of this dispatch; default 1. */
  readonly attempt?: number;
  readonly caseContext?: CaseContext;
}

/** A provider's own view of one invocation (design D2 `InvocationView`). */
export interface InvocationView {
  readonly status: RlmInvocationStatus;
  /**
   * Additive (#113). The invocation this view describes. After an interruption the runtime never calls `invoke`
   * again: it trusts a terminal view only when this equals the original `invocationId`; a view without it (or
   * with another id) is unverifiable and parks the invocation on the ambiguous-invocation wait.
   */
  readonly invocationId?: string;
  readonly resultRef?: string;
  readonly evidence: readonly string[];
  readonly payment: RlmPayment;
  readonly isolation: RlmIsolation;
  readonly lastEventAt: string;
}

/** What a provider may decide a lost effect's outcome is (design D2 `InvocationOutcome`). */
export type RlmInvocationOutcome = RlmTerminalStatus | "indeterminate";

/**
 * The internal provider port. Implemented by a provider package, never by the core contract.
 * A provider never supplies a principal or a grant (D4.2).
 */
export interface RlmProvider {
  readonly id: string;
  /** Capabilities + executable + tool policy + isolation, reported not inferred (D1). */
  probe(): Promise<ProviderFacts>;
  /** Run the investigation for `req`, using `spawn` for any child process and `ctx` for durable effects. `ctx.runId` is the child run's id and the key `inspect` and `cancel` receive. */
  invoke(req: RlmInvokeRequest, spawn: StdioSpawnPort, ctx: RunContext): Promise<{ readonly runId: string }>;
  /**
   * The provider's current view of one invocation. `runId` is ALWAYS the child run's id (`ctx.runId` inside `invoke`), the
   * stable recovery key: it is what the runtime passes after a lost response, a throw before `invoke` returned anything, a
   * restart or a reconciliation. A provider must record its state under `ctx.runId` (not only under any id of its own) so
   * that `inspect(ctx.runId)` can answer after `invoke` threw. Return `invocationId` so the view can be verified.
   */
  inspect(runId: string): Promise<InvocationView>;
  /**
   * Stop the invocation; idempotent. `runId` is the child run's id, as for `inspect`. A cancel for a run the provider has not
   * started yet must be sticky: a later `invoke` for that run must not start (the runtime narrows but cannot close the window
   * between its last check and the `invoke` call).
   */
  cancel(runId: string, reason: string): Promise<void>;
  /** Optional: decide a lost effect's outcome after interruption. */
  reconcile?(runId: string): Promise<RlmInvocationOutcome>;
}

// ── The host-implemented stdio port (design D2) ─────────────────────────────────

export interface StdioSpawnSpec {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly restrictions: {
    readonly filesystem?: readonly string[];
    readonly network?: { readonly outbound: readonly string[] };
    readonly caps?: { readonly memoryBytes?: number; readonly cpuSeconds?: number };
    readonly subprocess?: boolean;
  };
}

/**
 * A governed long-lived child process. Declared here; implemented by the host application, which owns
 * the posture, ledger, slots and intent records (design D2). A standalone host may supply none, in
 * which case every external provider reports `unavailable`.
 */
export interface StdioSpawnPort {
  spawn(spec: StdioSpawnSpec, ctx: { readonly intentId: string; readonly runId: string }): Promise<{ readonly id: string }>;
  write(id: string, line: string): Promise<void>;
  readLines(id: string, sink: (line: string) => void): Promise<void>;
  kill(id: string, reason: string): Promise<void>;
}

/** A `StdioSpawnPort` that refuses every call: what a host with no governed port supplies. */
export function unavailableSpawnPort(): StdioSpawnPort {
  const refuse = (): Promise<never> => Promise.reject(new Error("rlm-port-unavailable"));
  return { spawn: refuse, write: refuse, readLines: refuse, kill: refuse };
}

/**
 * The invocation binding as it was written to the parent run's state before the RLM control stream existed (D4.2). It is
 * read-only history now: the runtime-owned `rlm-control/<parentRunId>` stream is authoritative, and an invocation that
 * only has this binding is inspected and cancelled but never admitted or dispatched again.
 */
export interface RlmInvocationBinding {
  readonly invocationId: string;
  readonly runId: string;
  readonly providerId: string;
  readonly parentRunId: string;
  readonly depth: number;
  readonly contextDigest: string;
  readonly admittedAt: string;
  /** The governing limit; `unknown` makes the recorded spend authoritative-unknown (D4.5). */
  readonly budgetLimit: number | "unknown";
  readonly reservationRef?: string;
  /** Additive (#113): the attempt identity recorded with the dispatch intent; absent means 1. */
  readonly attempt?: number;
  /**
   * Additive (#113). `pending-start` is written before the child run is started (`runId` is then `""` and the child is
   * found by its correlation id `rlm:<parentRunId>:<invocationId>`); `started` once `runId` is known. Absent means `started`.
   */
  readonly state?: "pending-start" | "started";
  /** Additive (#113): the outcome of `rlm.cancel`, recorded durably. */
  readonly cancellation?: {
    readonly requestedAt: string;
    readonly reason: string;
    /** Whether a dispatch intent had been recorded; a provider is only asked to cancel after one. */
    readonly dispatched: boolean;
    readonly providerCancel: "not-dispatched" | "cancelled" | "failed";
    readonly error?: string;
  };
}

/** Where an invocation binding lives in a run's state. */
export const RLM_STATE_ROOT = "rlm";
export const RLM_INVOCATIONS_KEY = "invocations";

/** Read one invocation binding from a folded run state; `undefined` when absent. */
export function readInvocationBinding(state: Json | null | undefined, invocationId: string): RlmInvocationBinding | undefined {
  if (!state || typeof state !== "object" || Array.isArray(state)) return undefined;
  const root = (state as { readonly [key: string]: Json })[RLM_STATE_ROOT];
  if (!root || typeof root !== "object" || Array.isArray(root)) return undefined;
  const invocations = (root as { readonly [key: string]: Json })[RLM_INVOCATIONS_KEY];
  if (!invocations || typeof invocations !== "object" || Array.isArray(invocations)) return undefined;
  if (!Object.hasOwn(invocations, invocationId)) return undefined;
  const binding = (invocations as { readonly [key: string]: Json })[invocationId];
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return undefined;
  return binding as unknown as RlmInvocationBinding;
}

/**
 * Additive (#113). A parent's authority is withdrawn for one invocation (or all of them, key `*`) by recording a
 * reason at `rlm.revoked.<invocationId>` in the parent run's state. A withdrawn grant refuses a new dispatch.
 */
export const RLM_REVOKED_KEY = "revoked";

export function readGrantRevocation(state: Json | null | undefined, invocationId: string): string | undefined {
  if (!state || typeof state !== "object" || Array.isArray(state)) return undefined;
  const root = (state as { readonly [key: string]: Json })[RLM_STATE_ROOT];
  if (!root || typeof root !== "object" || Array.isArray(root)) return undefined;
  const revoked = (root as { readonly [key: string]: Json })[RLM_REVOKED_KEY];
  if (!revoked || typeof revoked !== "object" || Array.isArray(revoked)) return undefined;
  const table = revoked as { readonly [key: string]: Json };
  // A null or false entry is "not revoked": it must not mask a wildcard withdrawal, while a present specific reason wins.
  const present = (key: string): Json | undefined => (Object.hasOwn(table, key) && table[key] !== null && table[key] !== false && table[key] !== undefined ? table[key] : undefined);
  const entry = present(invocationId) ?? present("*");
  if (entry === undefined) return undefined;
  return typeof entry === "string" ? entry : "revoked";
}

const REFUSAL_BRAND = Symbol.for("cognate.rlm.providerRefusal");
export const RLM_REFUSAL_CODE_PATTERN = /^[a-z0-9._-]{1,48}$/;

/**
 * Additive (#113). A provider throws this from `invoke` to say it DEFINITELY did nothing (it refused before any side
 * effect). The child run then fails, recording only the bounded `code` (never the message, which may carry secrets).
 * Any other throw from `invoke`, including an object that merely claims to be definite, is a lost response: the provider
 * may have acted, so the original invocation is inspected or parked, never re-invoked.
 */
export class RlmProviderRefusal extends Error {
  override readonly name = "RlmProviderRefusal";
  readonly [REFUSAL_BRAND] = true as const;
  /** A bounded, non-secret reason code (`[a-z0-9._-]{1,48}`); anything else is recorded as `refused`. */
  readonly code: string;
  constructor(message: string, code = "refused") {
    super(message);
    this.code = RLM_REFUSAL_CODE_PATTERN.test(code) ? code : "refused";
  }
}

export const isDefiniteProviderRefusal = (error: unknown): error is RlmProviderRefusal =>
  error instanceof RlmProviderRefusal || (typeof error === "object" && error !== null && (error as Record<symbol, unknown>)[REFUSAL_BRAND] === true && typeof (error as { code?: unknown }).code === "string" && RLM_REFUSAL_CODE_PATTERN.test((error as { code: string }).code));
