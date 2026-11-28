// RLM component (CognitiveOS convergence I1, design D1/D2/D4/D5).
//
// Provider-neutral `rlm.providers|invoke|inspect|cancel` over the normal Invoker. An invocation starts
// exactly one `agent.rlm` child run for the parent run. Every admission, dispatch intent, cancellation, revocation and
// accepted outcome is an event on the runtime-owned `rlm-control/<parentRunId>` stream (rlm-control.ts), decided with a
// compare-and-set on its version; the parent's generic run state is no longer authoritative for any of it. Inspect/cancel
// are addressed by (parentRunId, invocationId) and re-derive everything from that stream, so they survive restart. An
// `unknown` effect parks the child on the existing `ambiguous-invocation` continuation; there is no `rlm.reconcile`.
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import type { Component, HandlerContext, Principal, SemanticRef } from "@godspeedai/cognate-kernel-api";
import {
  foldState,
  type RunContext,
  INVOCATION_STATUSES,
  isDefiniteProviderRefusal,
  RLM_REFUSAL_CODE_PATTERN,
  isTerminalInvocationStatus,
  RLM_AGENT_ID,
  RLM_CAPABILITIES,
  readInvocationBinding,
  unavailableSpawnPort,
  type AgentDefinition,
  type InvocationView,
  type Caller,
  type PortGovernance,
  type RlmAdmission,
  type RlmCancelInput,
  type RlmCancelOutput,
  type RlmInspectInput,
  type RlmInspectOutput,
  type RlmInvocationBinding,
  type RlmInvocationStatus,
  type RlmInvokeInput,
  type RlmInvokeRequest,
  type RlmPayment,
  type RlmProvider,
  type RlmProviderView,
  type RlmProvidersOutput,
  type RlmRefusalCode,
  type RunView,
  type RuntimeService,
  type StdioSpawnPort,
} from "@godspeedai/cognate-runtime-api";

import { ConcurrencyError } from "@godspeedai/cognate-events";
import { Halt } from "./executor.ts";
import { runStream, toJson } from "./fold.ts";
import { appendControl, childInputOf, decideControl, readControl, requestFingerprint, RLM_EVENTS, RLM_PROTOCOL, structuredKey, taskKeyOf, withdrawnReason, type RlmControlState, type RlmInvocationFold } from "./rlm-control.ts";

/** A typed refusal carrying one of the design D5 codes exactly; the code leads the message so it survives any transport. */
export class RlmRefusedError extends Error {
  override readonly name = "RlmRefusedError";
  constructor(readonly code: RlmRefusalCode, readonly reason: string) {
    super(`${code}: ${reason}`);
  }
}

// ── provider registry (configuration, not code) ─────────────────────────────────

export interface RlmProviderAvailability {
  readonly status: "available" | "unavailable";
  /** Present exactly when `status === "unavailable"`. */
  readonly reason?: string;
}

/** One operator-configured provider: the port implementation plus how it is offered and governed. */
export interface RlmProviderRegistration {
  readonly provider: RlmProvider;
  readonly label: string;
  readonly portGovernance?: PortGovernance;
  /** Operator-declared standing; default `available`. */
  readonly availability?: RlmProviderAvailability;
}

export interface RlmRegistry {
  register(registration: RlmProviderRegistration): void;
  get(id: string): RlmProviderRegistration | undefined;
  list(): readonly RlmProviderRegistration[];
}

/** The provider registry. Empty by default: absence is reported as absence, never as a weaker provider. */
export function createRlmRegistry(): RlmRegistry {
  const entries = new Map<string, RlmProviderRegistration>();
  return {
    register(registration) {
      entries.set(registration.provider.id, registration);
    },
    get(id) {
      return entries.get(id);
    },
    list() {
      return [...entries.values()].sort((a, b) => a.provider.id.localeCompare(b.provider.id));
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────────

const isObject = (value: Json | undefined): value is Record<string, Json> => !!value && typeof value === "object" && !Array.isArray(value);

async function foldRunState(service: RuntimeService, caller: Caller, runId: string): Promise<Json> {
  const events = [];
  for await (const event of service.events(caller, { runId })) events.push(event);
  return foldState(events);
}

const ERROR_CLASSES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "TimeoutError", "AbortError"]);
/**
 * A provider-supplied `Error.name` is writable, and may be an accessor: it is read ONCE, inside a guard, and only an
 * allowlisted class or a fixed fallback is ever persisted (the value validated is the value stored).
 */
function safeErrorClass(error: unknown): string {
  try {
    if (!(error instanceof Error)) return "non-error";
    const name: unknown = error.name;
    return typeof name === "string" && ERROR_CLASSES.has(name) ? name : "Error";
  } catch {
    return "Error";
  }
}

/**
 * Withdraw a parent's authority for one invocation (or every invocation with `"*"`): later dispatches under it are refused.
 * An event on the control stream, ordered against every dispatch by its compare-and-set, and out of reach of generic state.
 */
export async function revokeRlmGrant(runtime: { readonly service: RuntimeService; readonly store: DurableStore }, caller: Caller, parentRunId: string, invocationId: string, reason: string): Promise<void> {
  const view = await runtime.service.getRun(caller, { runId: parentRunId });
  if (view.startedBy !== caller.actor.id) throw new RlmRefusedError("rlm-invocation-unknown", `the caller has no standing on run ${parentRunId}`);
  await decideControl(runtime.store, parentRunId, () => ({ events: [{ eventType: RLM_EVENTS.revoked, payload: { key: invocationId, reason }, metadata: { key: invocationId } }], result: undefined }));
}

/** The caller's standing on a parent run: same tenant (enforced by `getRun`) and the parent's own starter. */
async function parentFor(service: RuntimeService, caller: Caller, input: { readonly parentRunId?: string }, ctxRunId: string | undefined, what: string): Promise<{ parentRunId: string; startedBy: string }> {
  const parentRunId = input.parentRunId ?? ctxRunId;
  if (!parentRunId) throw new RlmRefusedError("rlm-invocation-unknown", `${what} requires the parent run`);
  let view: RunView;
  try {
    view = await service.getRun(caller, { runId: parentRunId });
  } catch {
    throw new RlmRefusedError("rlm-invocation-unknown", `parent run ${parentRunId} is not visible to this caller`);
  }
  if (view.startedBy !== caller.actor.id) throw new RlmRefusedError("rlm-invocation-unknown", `the caller has no standing on run ${parentRunId}`);
  return { parentRunId, startedBy: view.startedBy };
}

/**
 * The invocation a caller names: from the control stream, or, for one admitted before the control stream existed, from the
 * pre-change binding in the parent's state (read-only: it carries no admission, so it is inspected and cancelled but never
 * dispatched, and it does not take part in attempt exclusion).
 */
async function invocationFor(store: DurableStore, service: RuntimeService, caller: Caller, input: { readonly invocationId: string; readonly parentRunId?: string }, ctxRunId: string | undefined, what: string): Promise<{ parentRunId: string; inv: RlmInvocationFold; legacy: boolean }> {
  const { parentRunId } = await parentFor(service, caller, input, ctxRunId, what);
  const control = await readControl(store, parentRunId);
  const inv = control.invocations.get(input.invocationId);
  if (inv) return { parentRunId, inv, legacy: false };
  const binding = readInvocationBinding(await foldRunState(service, caller, parentRunId), input.invocationId);
  if (!binding) throw new RlmRefusedError("rlm-invocation-unknown", `invocation ${input.invocationId} is not recorded on run ${parentRunId}`);
  let childRunId = binding.runId;
  if (!childRunId) for (const run of await service.listRuns(caller, { correlationId: `rlm:${parentRunId}:${binding.invocationId}` })) {
    const runInput = isObject(run.input) ? run.input : {};
    if (run.agent === RLM_AGENT_ID && runInput.invocationId === binding.invocationId && runInput.runId === parentRunId) { childRunId = run.runId; break; }
  }
  const legacyFold: RlmInvocationFold = {
    invocationId: binding.invocationId, attempt: binding.attempt ?? 1, childRunId, parentRunId, providerId: binding.providerId, depth: binding.depth,
    taskKey: "legacy", requestFingerprint: "legacy", budgetLimit: binding.budgetLimit, admittedAt: binding.admittedAt, protocolVersion: 1,
    started: !!childRunId, dispatchIntended: true,
  };
  return { parentRunId, inv: legacyFold, legacy: true };
}

// ── invocation status (derived from the child run; terminal is stable) ──────────

interface ChildSummary {
  readonly outcome?: Json;
  readonly lastEventAt?: string;
}

async function childSummary(service: RuntimeService, caller: Caller, childRunId: string): Promise<ChildSummary> {
  let outcome: Json | undefined;
  let lastEventAt: string | undefined;
  let modern = false;
  let first = true;
  for await (const event of service.events(caller, { runId: childRunId })) {
    if (first) {
      first = false;
      modern = (event.metadata as { rlmProtocol?: unknown } | null | undefined)?.rlmProtocol === RLM_PROTOCOL;
    }
    lastEventAt = event.occurredAt;
    // Only a pre-change history may carry its outcome as an emitted event; a protocol-2 child records the named step only.
    if (!modern && event.eventType === "rlm.outcome") outcome = event.payload;
    const named = (event.metadata as { stepId?: unknown } | null | undefined)?.stepId === "step:rlm.outcome";
    const result = named && event.eventType === "run.step.completed" && isObject(event.payload) && isObject(event.payload.result) ? event.payload.result : undefined;
    if (result && isObject(result.rlmOutcome)) outcome = result.rlmOutcome;
  }
  return { ...(outcome !== undefined ? { outcome } : {}), ...(lastEventAt !== undefined ? { lastEventAt } : {}) };
}

/** The invocation status: the child run's own state, `unknown` while it awaits reconciliation (D4.7). */
async function invocationStatus(service: RuntimeService, caller: Caller, childRunId: string): Promise<RlmInvocationStatus> {
  const child = await service.getRun(caller, { runId: childRunId });
  if (child.status === "completed") {
    const output = child.output;
    const status = output && typeof output === "object" && !Array.isArray(output) ? (output as { readonly status?: unknown }).status : undefined;
    return typeof status === "string" && (INVOCATION_STATUSES as readonly string[]).includes(status) ? (status as RlmInvocationStatus) : "completed";
  }
  if (child.status === "failed") return "failed";
  if (child.status === "cancelled") return "cancelled";
  if (child.status === "waiting") return "unknown";
  // Running or admitted: the observable difference is whether the child has done anything but start. Once the dispatch intent
  // is durable the provider may be acting: dispatched reads as running (admitted is before that).
  for await (const event of service.events(caller, { runId: childRunId })) if (event.eventType !== "run.started") return "running";
  return "admitted";
}

/** The status of an invocation: the child's own state, `cancelled` once a cancellation is recorded and no child exists, else `admitted`. */
async function statusOf(service: RuntimeService, caller: Caller, inv: RlmInvocationFold): Promise<RlmInvocationStatus> {
  if (inv.started && inv.childRunId) return invocationStatus(service, caller, inv.childRunId);
  return inv.cancel ? "cancelled" : "admitted";
}

/** The provider cancel is settled when the provider confirmed it, or when nothing was ever dispatched to cancel. */
const cancelSettledOk = (inv: RlmInvocationFold): boolean => {
  const settled = inv.cancel?.settled;
  if (settled && (settled.outcome === "cancelled" || settled.outcome === "not-dispatched")) return true;
  return !inv.dispatchIntended;
};

/**
 * Positive evidence that a predecessor attempt is finished: its outcome was accepted, its cancellation settled (provider
 * confirmed, or nothing was dispatched), or its child is terminal with no dispatch intent ever recorded. A cancel that is
 * merely requested, a child that is merely terminal after dispatch, or an admission with no child yet, is not evidence.
 */
async function attemptResolved(service: RuntimeService, caller: Caller, inv: RlmInvocationFold): Promise<boolean> {
  if (inv.accepted) return true;
  const settled = inv.cancel?.settled;
  if (settled && (settled.outcome === "cancelled" || settled.outcome === "not-dispatched")) return true;
  if (inv.started && !inv.dispatchIntended) return isTerminalInvocationStatus(await invocationStatus(service, caller, inv.childRunId));
  return false;
}

const DEFAULT_PAYMENT: RlmPayment = { currency: "time", spent: "unknown", basis: "unmeasured" };

// ── the component ───────────────────────────────────────────────────────────────

export interface RlmComponentOptions {
  readonly registry: RlmRegistry;
  /** The runtime service, late-bound because the runtime is created after its components (as in `subagent.start`). */
  readonly getService: () => RuntimeService;
  /** The runtime's store (`runtime.store`), late-bound the same way: the RLM control stream lives on it. */
  readonly getStore: () => DurableStore;
  /** This host's admission posture. Default `{ governance: "off", posture: "uncontained-local" }`. */
  readonly admission?: { readonly governance: "on" | "off"; readonly posture: "contained" | "uncontained-local" };
  readonly semanticRef?: SemanticRef;
}

export function createRlmComponent(options: RlmComponentOptions): Component {
  const contract = (id: string) => ({ id, version: "1.0.0", ...(options.semanticRef ? { semanticRef: options.semanticRef } : {}) });
  const service = () => options.getService();
  const store = () => options.getStore();

  const admissionTable = (): RlmAdmission => {
    const governance = options.admission?.governance ?? "off";
    const posture = options.admission?.posture ?? "uncontained-local";
    const refusalCode = governance === "on" && posture === "uncontained-local" ? ("rlm-posture-refused" as const) : undefined;
    return { governance, posture, externalProvider: refusalCode ? "refused" : "admitted", ...(refusalCode ? { refusalCode } : {}) };
  };

  const providers = async (): Promise<RlmProvidersOutput> => {
    const views: RlmProviderView[] = [];
    for (const entry of options.registry.list()) {
      const facts = await entry.provider.probe();
      const availability = entry.availability;
      const status = availability?.status ?? "available";
      views.push({
        id: entry.provider.id,
        label: entry.label,
        capabilities: facts.capabilities,
        toolPolicy: facts.toolPolicy,
        executable: facts.executable,
        ...(entry.portGovernance ? { portGovernance: entry.portGovernance } : {}),
        status,
        ...(status === "unavailable" ? { reason: availability?.reason ?? "unavailable" } : {}),
      });
    }
    return { providers: views, admission: admissionTable() };
  };

  const invoke = async (raw: unknown, ctx: HandlerContext): Promise<Json> => {
    const input = (raw ?? {}) as RlmInvokeInput;
    const parentRunId = ctx.runId;
    if (!parentRunId || !input.parent || input.parent.runId !== parentRunId) {
      throw new RlmRefusedError("rlm-top-level-invocation", `rlm.invoke must run inside its parent run (handler run ${parentRunId ?? "none"}, declared ${input.parent?.runId ?? "none"})`);
    }
    // Authority is caller-attested and re-checked: a request outside the parent's grant is refused, never silently narrowed (D4.3).
    const grant = new Set(input.parent.authorityTools ?? []);
    const outside = (input.authority?.tools ?? []).filter((tool) => !grant.has(tool));
    if (outside.length > 0) throw new RlmRefusedError("rlm-authority-exceeds-parent", `authority ${outside.join(", ")} is not a subset of the parent's grant`);
    if (input.parent.depth + 1 > input.parent.maxDepth) throw new RlmRefusedError("rlm-depth-exceeded", `depth ${input.parent.depth + 1} exceeds the governing maxDepth ${input.parent.maxDepth}`);
    if (input.budget.limit !== "unknown" && input.budget.reservationRef === undefined) throw new RlmRefusedError("rlm-budget-unverifiable", "a numeric budget limit needs a reservationRef the seam can consult");
    const entry = options.registry.get(input.providerId);
    if (!entry) throw new RlmRefusedError("rlm-provider-unknown", `provider ${input.providerId} is not registered`);
    if (entry.availability?.status === "unavailable") throw new RlmRefusedError("rlm-provider-unavailable", `provider ${input.providerId} is ${entry.availability.reason ?? "unavailable"}`);
    if (admissionTable().externalProvider === "refused") throw new RlmRefusedError("rlm-posture-refused", "this host's governance or posture forbids an external provider");
    if (input.attempt !== undefined && !(Number.isInteger(input.attempt) && input.attempt >= 1)) throw new RlmRefusedError("rlm-attempt-refused", `attempt must be a positive integer, got ${String(input.attempt)}`);
    const attempt = input.attempt ?? 1; // the contract default, applied before anything is compared

    const svc = service();
    const db = store();
    const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };
    const childInput = childInputOf({ invocationId: input.invocationId, providerId: input.providerId, parent: input.parent, attempt, task: input.task as unknown as Json, authority: input.authority as unknown as Json, budget: input.budget as unknown as Json, ...(input.caseContext ? { caseContext: input.caseContext as unknown as Json } : {}) });
    const fingerprintOfRequest = requestFingerprint(childInput);
    const taskKey = taskKeyOf(input.task);

    // An invocation recorded in the parent's state before the control stream existed (a binding, possibly still pending-start) is
    // read-only history: it may already have dispatched, so it is never admitted again; it goes to inspection or reconciliation.
    const legacy = readInvocationBinding(await foldRunState(svc, caller, parentRunId), input.invocationId);
    if (legacy && !(await readControl(db, parentRunId)).invocations.has(input.invocationId)) throw new RlmRefusedError("rlm-invocation-ambiguous", `invocation ${input.invocationId} was recorded before the RLM control stream existed; inspect or reconcile it, a retry needs a new invocationId`);

    // Admission: one compare-and-set on the control stream. A reuse of an invocationId resolves to the admitted record and must
    // present the same attempt and the same request; a new one needs every predecessor attempt of the same task resolved by
    // positive evidence. Nothing here reads generic run state.
    const admitted = await decideControl(db, parentRunId, async (state) => {
      const held = state.invocations.get(input.invocationId);
      if (held) {
        if (held.attempt !== attempt) throw new RlmRefusedError("rlm-invocation-ambiguous", `invocation ${input.invocationId} already holds attempt ${held.attempt}; a retry needs a new invocationId, grant and reservationRef`);
        if (held.requestFingerprint !== fingerprintOfRequest) throw new RlmRefusedError("rlm-invocation-ambiguous", `invocation ${input.invocationId} was admitted for a different request; a different request needs a new invocationId`);
        return { events: [], result: held };
      }
      const parent = await svc.getRun(caller, { runId: parentRunId });
      const withdrawn = parent.status === "cancelled" ? `parent run ${parentRunId} was cancelled` : withdrawnReason(state, input.invocationId);
      if (withdrawn) throw new RlmRefusedError("rlm-authority-exceeds-parent", `${withdrawn}; no new dispatch`);
      for (const other of state.invocations.values()) {
        if (other.taskKey !== taskKey) continue;
        if (!(await attemptResolved(svc, caller, other))) throw new RlmRefusedError("rlm-attempt-refused", `attempt ${other.invocationId} for this task is unresolved; reconcile or cancel it (and settle its provider cancel) before a new attempt`);
      }
      const childRunId = crypto.randomUUID();
      const fold: RlmInvocationFold = {
        invocationId: input.invocationId, attempt, childRunId, parentRunId, providerId: input.providerId, depth: input.parent.depth + 1, taskKey, requestFingerprint: fingerprintOfRequest,
        budgetLimit: input.budget.limit, ...(input.budget.reservationRef ? { reservationRef: input.budget.reservationRef } : {}), admittedAt: new Date().toISOString(), protocolVersion: RLM_PROTOCOL, started: false, dispatchIntended: false,
      };
      return {
        events: [{
          eventType: RLM_EVENTS.admitted,
          payload: { invocationId: input.invocationId, attempt, childRunId, parentRunId, providerId: input.providerId, depth: fold.depth, taskKey, requestFingerprint: fingerprintOfRequest, budgetLimit: input.budget.limit, ...(input.budget.reservationRef ? { reservationRef: input.budget.reservationRef } : {}), admittedAt: fold.admittedAt, protocolVersion: RLM_PROTOCOL },
          metadata: { invocationId: input.invocationId, attempt, childRunId },
        }],
        result: fold,
      };
    });

    if (admitted.started) {
      if ((await invocationStatus(svc, caller, admitted.childRunId)) === "unknown") throw new RlmRefusedError("rlm-invocation-ambiguous", `invocation ${input.invocationId} is ambiguous; reconcile it before retrying`);
      return { invocationId: input.invocationId, runId: admitted.childRunId, status: "admitted" };
    }
    if (admitted.cancel) throw new RlmRefusedError("rlm-attempt-refused", `invocation ${input.invocationId} was cancelled before it started`);

    // The child principal is derived from the parent run's starter; a provider never supplies one (D4.2). The start is validated
    // against the admission by the service itself, which also binds the child to it in the same commit as `run.started`.
    const parentView = await svc.getRun(caller, { runId: parentRunId });
    const childPrincipal: Principal = { id: parentView.startedBy || RLM_AGENT_ID, kind: "agent" };
    try {
      await svc.startRun(
        { actor: childPrincipal, tenant: ctx.tenant },
        { agent: RLM_AGENT_ID, input: childInput, idempotencyKey: structuredKey("rlm.start", parentRunId, input.invocationId, String(attempt), admitted.childRunId), correlationId: `rlm:${parentRunId}:${input.invocationId}`, ...(input.caseContext ? { caseContext: input.caseContext } : {}) },
      );
    } catch (error) {
      // A cancel or revocation that won the race on the control stream refuses the start: report it as such.
      const now = (await readControl(db, parentRunId)).invocations.get(input.invocationId);
      if (now?.cancel) throw new RlmRefusedError("rlm-attempt-refused", `invocation ${input.invocationId} was cancelled before it started`);
      throw error;
    }
    return { invocationId: input.invocationId, runId: admitted.childRunId, status: "admitted" };
  };

  const inspect = async (raw: unknown, ctx: HandlerContext): Promise<Json> => {
    const input = (raw ?? {}) as RlmInspectInput;
    const svc = service();
    const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };
    const { inv } = await invocationFor(store(), svc, caller, input, ctx.runId, "inspection");
    // One lookup of the child: status and summary come from the same run.
    const status = await statusOf(svc, caller, inv);
    const summary = inv.started && inv.childRunId ? await childSummary(svc, caller, inv.childRunId) : {};
    const outcome = summary.outcome && typeof summary.outcome === "object" && !Array.isArray(summary.outcome) ? (summary.outcome as Record<string, Json>) : {};
    const reported = (outcome.payment as unknown as RlmPayment | undefined) ?? DEFAULT_PAYMENT;
    // An unbounded limit cannot be bounded: the recorded spend is authoritative-unknown, never the provider's number (D4.5).
    const payment: RlmPayment = inv.budgetLimit === "unknown" ? { currency: reported.currency, spent: "unknown", basis: "unknown-budget-limit" } : reported;
    const isolation = typeof outcome.isolation === "string" ? outcome.isolation : "none";
    const evidence = Array.isArray(outcome.evidence) ? outcome.evidence : [];
    const resultRef = typeof outcome.resultRef === "string" ? outcome.resultRef : undefined;
    return {
      status,
      ...(resultRef ? { resultRef } : {}),
      evidence,
      payment,
      providerId: inv.providerId,
      isolation,
      lastEventAt: summary.lastEventAt ?? inv.admittedAt,
      ...(outcome.reconciled === true ? { reconciled: true } : {}),
    } as unknown as Json;
  };

  const cancel = async (raw: unknown, ctx: HandlerContext): Promise<Json> => {
    const input = (raw ?? {}) as RlmCancelInput;
    const svc = service();
    const db = store();
    const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };
    const reason = input.reason || "rlm.cancel";
    const found = await invocationFor(db, svc, caller, input, ctx.runId, "cancellation");
    const { parentRunId } = found;
    let inv = found.inv;
    const status = await statusOf(svc, caller, inv);
    const terminal = isTerminalInvocationStatus(status);
    // Already finished, except a child our own cancel closed (or one cancelled elsewhere) whose provider cancel never settled:
    // that retry asks the provider again, and only that.
    if (terminal && !(status === "cancelled" && !cancelSettledOk(inv))) return { status: "already-terminal" } as unknown as Json;

    if (found.legacy) {
      // An invocation from before the control stream: cancel the child, ask the provider (it may have dispatched), no record.
      if (inv.childRunId && !terminal) await svc.cancelRun(caller, { runId: inv.childRunId, reason, idempotencyKey: structuredKey("rlm.cancel", parentRunId, inv.childRunId) });
      let providerCancel: "cancelled" | "failed" = "cancelled";
      let error: string | undefined;
      try {
        await options.registry.get(inv.providerId)?.provider.cancel(inv.childRunId, reason);
      } catch (cause) {
        providerCancel = "failed";
        error = safeErrorClass(cause);
      }
      return { status: "cancelled", dispatched: true, providerCancel, ...(error ? { error } : {}) } as unknown as Json;
    }

    // 1. The request is durable BEFORE the child is closed: a concurrent retry sees "cancel requested" and waits for its settlement.
    inv = await decideControl(db, parentRunId, (state) => {
      const current = state.invocations.get(input.invocationId)!;
      return current.cancel ? { events: [], result: current } : { events: [{ eventType: RLM_EVENTS.cancelRequested, payload: { invocationId: input.invocationId, attempt: current.attempt, reason }, metadata: { invocationId: input.invocationId, attempt: current.attempt } }], result: current };
    });
    inv = (await readControl(db, parentRunId)).invocations.get(input.invocationId)!;
    // 2. Cancel the child (it may have been started concurrently: the fold is re-read). A cancelled child cannot dispatch later:
    //    its dispatch intent is a compare-and-set on the stream this request just advanced.
    if (inv.started && !terminal) await svc.cancelRun(caller, { runId: inv.childRunId, reason, idempotencyKey: structuredKey("rlm.cancel", parentRunId, inv.childRunId) });
    inv = (await readControl(db, parentRunId)).invocations.get(input.invocationId)!;
    // 3. Only now is "was it dispatched" a settled question.
    let outcome: "cancelled" | "not-dispatched" | "failed" = "not-dispatched";
    let errorClass: string | undefined;
    if (inv.dispatchIntended) {
      try {
        const registered = options.registry.get(inv.providerId);
        if (!registered) throw new Error("provider is not registered");
        await registered.provider.cancel(inv.childRunId, reason);
        outcome = "cancelled";
      } catch (cause) {
        outcome = "failed";
        errorClass = safeErrorClass(cause);
      }
    }
    // 4. The settlement (a later retry appends its own; the last one counts).
    await decideControl(db, parentRunId, () => ({ events: [{ eventType: RLM_EVENTS.cancelSettled, payload: { invocationId: input.invocationId, attempt: inv.attempt, outcome, ...(errorClass ? { errorClass } : {}) }, metadata: { invocationId: input.invocationId, attempt: inv.attempt } }], result: undefined }));
    return { status: "cancelled", dispatched: inv.dispatchIntended, providerCancel: outcome, ...(errorClass ? { error: errorClass } : {}) } as unknown as Json;
  };

  return {
    id: "rlm",
    provides: [contract(RLM_CAPABILITIES.providers), contract(RLM_CAPABILITIES.invoke), contract(RLM_CAPABILITIES.inspect), contract(RLM_CAPABILITIES.cancel)],
    activate(fiber) {
      fiber.provide<unknown, Json>(contract(RLM_CAPABILITIES.providers), async () => (await providers()) as unknown as Json);
      fiber.provide<unknown, Json>(contract(RLM_CAPABILITIES.invoke), invoke);
      fiber.provide<unknown, Json>(contract(RLM_CAPABILITIES.inspect), inspect);
      fiber.provide<unknown, Json>(contract(RLM_CAPABILITIES.cancel), cancel);
    },
  };
}

// ── the child agent ─────────────────────────────────────────────────────────────

interface RlmChildInput {
  readonly invocationId: string;
  readonly providerId: string;
  readonly runId: string;
  readonly depth: number;
  readonly maxDepth: number;
  readonly attempt?: number;
  readonly task: RlmInvokeRequest["task"];
  readonly authority: RlmInvokeRequest["authority"];
  readonly budget: RlmInvokeRequest["budget"];
  readonly caseContext?: RlmInvokeRequest["caseContext"];
}

const toOutcome = (payload: {
  status: RlmInvocationStatus;
  resultRef?: string;
  evidence?: readonly Json[];
  payment?: RlmPayment;
  isolation?: string;
  reconciled?: boolean;
}): Json =>
  toJson({
    status: payload.status,
    resultRef: payload.resultRef ?? null,
    evidence: payload.evidence ?? [],
    payment: payload.payment ?? DEFAULT_PAYMENT,
    isolation: payload.isolation ?? "none",
    ...(payload.reconciled ? { reconciled: true } : {}),
  });

/** Thrown inside the dispatch-result step on re-entry, where the provider must not be invoked again. */
class ReentryWithoutResult extends Error {}

interface DispatchRecord {
  readonly returned: boolean;
  /** The provider threw `RlmProviderRefusal`: it declared it did nothing. Only its bounded code is recorded. */
  readonly refused?: boolean;
  readonly refusalCode?: string;
  /** A redacted error class for an ambiguous throw; the message is never recorded. */
  readonly errorClass?: string;
}

const unverifiedView = (note: string): Json =>
  toJson({ status: "unknown", evidence: [note], payment: DEFAULT_PAYMENT, isolation: "none", lastEventAt: new Date().toISOString() });

const RESERVED_EMIT = /^rlm\.(outcome|dispatch\.)/;

/**
 * The `agent.rlm` child run. It dispatches only for an invocation the control stream admitted, for exactly this run and this
 * request; it records its dispatch intent with a compare-and-set on that stream (so a cancel or revocation that commits first
 * wins), then calls `provider.invoke` at most once for one (invocationId, attempt). A re-entry that finds an intent without a
 * recorded result (resume, restart, lost response) never invokes again; it inspects the original invocation and either
 * completes with a verified result, closes failed on a known failure, or parks on the existing `ambiguous-invocation`
 * continuation. A history without the protocol marker (a pre-change child) is never dispatched: it goes straight to inspection.
 * A provider throws `RlmProviderRefusal` to say it definitely did nothing; any other throw is ambiguous. The outcome is a
 * recorded step and the provider receives a frozen facade, not the raw context.
 *
 * BREAKING (#113): `getService` and `getStore` are required for a dispatch; without them the agent fails closed.
 */
export function createRlmAgent(options: { readonly registry: RlmRegistry; readonly spawnPort?: StdioSpawnPort; readonly getService?: () => RuntimeService; readonly getStore?: () => DurableStore }): AgentDefinition {
  const spawn = options.spawnPort ?? unavailableSpawnPort();
  return {
    id: RLM_AGENT_ID,
    version: "1.0.0",
    async run(input, ctx): Promise<Json> {
      const child = input as unknown as RlmChildInput;
      const entry = options.registry.get(child.providerId);
      if (!entry) throw new RlmRefusedError("rlm-provider-unknown", `provider ${child.providerId} is not registered`);
      const attempt = child.attempt ?? 1;
      const request: RlmInvokeRequest = {
        invocationId: child.invocationId,
        providerId: child.providerId,
        runId: child.runId,
        depth: child.depth,
        maxDepth: child.maxDepth,
        attempt,
        task: child.task,
        authority: child.authority,
        budget: child.budget,
        ...(child.caseContext ? { caseContext: child.caseContext } : {}),
      };
      const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };
      const myFingerprint = requestFingerprint(input);

      // Everything a dispatch needs to still be true, read in this order: signal, this run's status, the parent's status, and the
      // control stream LAST (it is the record a cancel or revocation is ordered on). Returns the control state it read.
      const assertDispatchable = async (): Promise<RlmControlState> => {
        if (ctx.signal.aborted) throw new Error("cancelled before dispatch");
        const service = options.getService?.();
        const store = options.getStore?.();
        if (!service || !store) throw new RlmRefusedError("rlm-authority-exceeds-parent", "the parent's authority cannot be verified (no service or store); no dispatch");
        const own = await service.getRun(caller, { runId: ctx.runId });
        if (own.status === "cancelled") throw new Error("cancelled before dispatch (this run was cancelled)");
        const parent = await service.getRun(caller, { runId: child.runId });
        if (parent.status === "cancelled") throw new RlmRefusedError("rlm-authority-exceeds-parent", `parent run ${child.runId} was cancelled; no new dispatch`);
        const control = await readControl(store, child.runId);
        const inv = control.invocations.get(child.invocationId);
        if (!inv || inv.childRunId !== ctx.runId || !inv.started || inv.requestFingerprint !== myFingerprint) throw new RlmRefusedError("rlm-authority-exceeds-parent", `no admission names this run and this request for invocation ${child.invocationId}; no dispatch`);
        const withdrawn = withdrawnReason(control, child.invocationId);
        if (withdrawn) throw new RlmRefusedError("rlm-authority-exceeds-parent", `${withdrawn}; no new dispatch`);
        if (inv.cancel) throw new Error(`cancelled before dispatch (${inv.cancel.reason})`);
        if (ctx.signal.aborted) throw new Error("cancelled before dispatch");
        return control;
      };
      // The outcome is a named step, never an emit: an emit id is a counter a provider's own emits can shift.
      const record = (outcome: Json): Promise<Json> => ctx.step("rlm.outcome", async () => toJson({ rlmOutcome: outcome }));
      let legacy = false;
      // Positive evidence that this attempt is finished is an event on the control stream (idempotent: once).
      const accept = async (status: RlmInvocationStatus): Promise<void> => {
        const store = options.getStore?.();
        if (!store || legacy) return;
        await decideControl(store, child.runId, (state) => {
          const inv = state.invocations.get(child.invocationId);
          if (!inv || inv.accepted) return { events: [], result: undefined };
          return { events: [{ eventType: RLM_EVENTS.outcomeAccepted, payload: { invocationId: child.invocationId, attempt, status }, metadata: { invocationId: child.invocationId, attempt } }], result: undefined };
        });
      };
      // A provider gets a frozen facade of the context, never the context itself: nothing is reachable through a prototype, it
      // cannot emit the reserved events, write a reserved step or wait on a reserved id.
      const facade: RunContext = {
        runId: ctx.runId, agent: ctx.agent, tenant: ctx.tenant, scopeId: ctx.scopeId, correlationId: ctx.correlationId, actor: ctx.actor, signal: ctx.signal,
        step: async <T extends Json>(id: string, fn: () => T | Promise<T>): Promise<T> => {
          if (id.startsWith("rlm.")) throw new Error(`step: id ${id} is reserved for the rlm agent`);
          return ctx.step(id, fn);
        },
        emit: async (eventType: string, payload: Json): Promise<void> => {
          if (RESERVED_EMIT.test(eventType)) throw new Error(`emit: event type ${eventType} is reserved for the rlm agent`);
          return ctx.emit(eventType, payload);
        },
        invoke: (capability, payload, opts) => ctx.invoke(capability, payload, opts),
        artifact: (artifact) => ctx.artifact(artifact),
        waitFor: async (id, spec) => {
          if (id.startsWith("ambiguous:") || id.startsWith("rlm.")) throw new Error(`waitFor: id ${id} is reserved for the rlm agent`);
          return ctx.waitFor(id, spec);
        },
        recall: (id, query) => ctx.recall(id, query),
        state: (id) => ctx.state(id),
        sharedState: (id) => ctx.sharedState(id),
        updateSharedState: (id, update) => ctx.updateSharedState(id, update),
        remoteOffers: (id) => ctx.remoteOffers(id),
        invokeRemoteOffer: (id, offerId, payload, opts) => ctx.invokeRemoteOffer(id, offerId, payload, opts),
      };
      const providerCtx: RunContext = Object.freeze(facade);

      // 1. Intent, a compare-and-set on the control stream. `fresh` is true only in the pass that commits it.
      let fresh = false;
      const identity = { invocationId: child.invocationId, providerId: child.providerId, attempt, parentRunId: child.runId };
      await ctx.step("rlm.dispatch.intent", async () => {
        if (ctx.signal.aborted) throw new Error("cancelled before dispatch");
        const store = options.getStore?.();
        if (!store) throw new RlmRefusedError("rlm-authority-exceeds-parent", "the parent's authority cannot be verified (no store); no dispatch");
        // Only a history this protocol admitted may dispatch: a child without the marker (even one with nothing but run.started,
        // whose provider may already have acted before the worker died) goes to inspection.
        const first = (await store.readStream(runStream(ctx.runId)))[0];
        if ((first?.metadata as { rlmProtocol?: unknown } | undefined)?.rlmProtocol !== RLM_PROTOCOL) {
          legacy = true;
          return toJson({ ...identity, legacy: true });
        }
        for (;;) {
          const control = await assertDispatchable();
          // An intent committed by a pass that died before recording this step: the provider may have been called.
          if (control.invocations.get(child.invocationId)!.dispatchIntended) return toJson({ ...identity, replayed: true });
          try {
            await appendControl(store, child.runId, control.version, [{ eventType: RLM_EVENTS.dispatchIntended, payload: { invocationId: child.invocationId, attempt, childRunId: ctx.runId }, metadata: { invocationId: child.invocationId, attempt, childRunId: ctx.runId } }]);
            fresh = true;
            return toJson({ ...identity, intendedAt: new Date().toISOString() });
          } catch (error) {
            if (!(error instanceof ConcurrencyError)) throw error; // a cancel, a revocation or another writer moved the stream: decide again
          }
        }
      });
      if (!legacy) {
        // A replayed legacy step: the marker is on the run's own first event.
        const first = (await options.getStore?.()?.readStream(runStream(ctx.runId)))?.[0];
        legacy = (first?.metadata as { rlmProtocol?: unknown } | undefined)?.rlmProtocol !== RLM_PROTOCOL;
      }

      // 2. Dispatch, once. On re-entry the step body runs only when no result was recorded, and then refuses to invoke.
      let dispatch: DispatchRecord;
      try {
        dispatch = (await ctx.step("rlm.dispatch.result", async (): Promise<Json> => {
          if (!fresh) throw new ReentryWithoutResult();
          await assertDispatchable(); // the last reads before the provider is reached
          try {
            await entry.provider.invoke(request, spawn, providerCtx);
            return toJson({ returned: true });
          } catch (error) {
            // Runtime control flow (cancel, shutdown, a lost write race) is not the provider's answer.
            if (ctx.signal.aborted || error instanceof Halt) throw error;
            if (isDefiniteProviderRefusal(error)) {
              const code = error.code; // read once: a getter or a later reassignment cannot change what is validated
              return toJson({ returned: false, refused: true, refusalCode: RLM_REFUSAL_CODE_PATTERN.test(code) ? code : "refused" });
            }
            // Any other throw after the provider may have acted is a lost response: inspected, never retried.
            return toJson({ returned: false, errorClass: safeErrorClass(error) });
          }
        })) as unknown as DispatchRecord;
      } catch (error) {
        if (!(error instanceof ReentryWithoutResult)) throw error;
        dispatch = { returned: false, errorClass: "reentered-without-result" };
      }
      if (dispatch.refused) {
        await record(toOutcome({ status: "failed", evidence: [`provider-refused:${dispatch.refusalCode ?? "refused"}`] }));
        await accept("failed");
        throw new Error(`provider refused the invocation (${dispatch.refusalCode ?? "refused"})`);
      }

      // 3. Inspect the original invocation. Only a view accepted as this invocation's is ever written to a step; a foreign one
      //    is replaced by a bare note. The decision to close on it is recorded WITH it, so a replay never reopens it.
      const askProvider = (acceptUnnamed: boolean) => async (): Promise<Json> => {
        try {
          const raw = await entry.provider.inspect(ctx.runId);
          if (raw.invocationId === child.invocationId || (acceptUnnamed && raw.invocationId === undefined)) return toJson(raw);
          return unverifiedView("foreign view ignored");
        } catch (error) {
          return unverifiedView(`inspect failed: ${safeErrorClass(error)}`);
        }
      };
      // "Returned cleanly in THIS execution": a recorded return that a recovered pass merely replays is not an uninterrupted invocation.
      const invokedNow = fresh && dispatch.returned;
      const recorded = (await ctx.step("rlm.dispatch.view", async () => {
        const raw = (await askProvider(invokedNow)()) as unknown as InvocationView;
        const tied = raw.invocationId === child.invocationId || (invokedNow && raw.invocationId === undefined);
        return toJson({ view: raw as unknown as Json, closed: tied && isTerminalInvocationStatus(raw.status) });
      })) as unknown as { view: InvocationView; closed: boolean };
      const view = recorded.view;
      const closed = recorded.closed;
      const threw = dispatch.errorClass ? [`provider-invoke-threw:${dispatch.errorClass}`] : [];
      if (!closed) {
        const resolution = (await ctx.waitFor(`ambiguous:${child.invocationId}`, {
          type: "ambiguous-invocation",
          condition: { kind: "ambiguous_invocation", capability: RLM_CAPABILITIES.invoke, invocationId: child.invocationId, providerId: child.providerId },
          payload: toJson({ invocationId: child.invocationId, providerId: child.providerId, runId: ctx.runId }),
        })) as { readonly failure?: unknown; readonly result?: unknown; readonly override?: unknown } | null;
        // Reconcile against what the provider says now, not the snapshot taken before the wait (recorded for replay).
        const latest = (await ctx.step("rlm.reconcile.view", askProvider(false))) as unknown as InvocationView;
        const latestTied = latest.invocationId === child.invocationId;
        const failed = !!resolution?.failure;
        const explicit = failed || (resolution?.result !== undefined && resolution.result !== null);
        // A view that does not name this invocation is foreign: none of its spend or evidence is recorded against it.
        const evidence = latestTied ? [...latest.evidence, `provider-view:${latest.status}`, ...threw] : ["foreign view ignored", ...threw];
        if (!explicit) {
          await record(toOutcome({ status: "failed", evidence: [...evidence, "reconciliation stated no outcome"], reconciled: true }));
          await accept("failed");
          throw new RlmRefusedError("rlm-invocation-ambiguous", `reconciliation of ${child.invocationId} must state an explicit result or failure`);
        }
        // An operator's claim of success never overrides a tied provider view that says it did not succeed, unless the
        // operator says so explicitly; the disagreement is recorded either way.
        const contradicted = !failed && latestTied && ["failed", "timedOut", "cancelled"].includes(latest.status);
        if (contradicted && resolution?.override !== true) {
          await record(toOutcome({ status: "failed", evidence: [...evidence, `operator result contradicts provider-view:${latest.status}`], payment: latest.payment, isolation: latest.isolation, reconciled: true }));
          await accept("failed");
          throw new RlmRefusedError("rlm-invocation-ambiguous", `the operator result for ${child.invocationId} contradicts the provider's ${latest.status} view; override: true must be supplied in the original resolution (this invocation is now closed failed)`);
        }
        const status: RlmInvocationStatus = failed ? "failed" : "completed";
        const finalEvidence = contradicted ? [...evidence, `operator override of provider-view:${latest.status}`] : failed && latestTied && latest.status === "completed" ? [...evidence, "operator failure contradicts provider-view:completed"] : evidence;
        await record(toOutcome({ status, evidence: finalEvidence, ...(latestTied ? { payment: latest.payment, isolation: latest.isolation, ...(latest.resultRef && status === "completed" ? { resultRef: latest.resultRef } : {}) } : {}), reconciled: true }));
        await accept(status);
        return { runId: ctx.runId, status, reconciled: true };
      }
      await record(toOutcome({ status: view.status, evidence: [...view.evidence, ...threw], payment: view.payment, isolation: view.isolation, ...(view.resultRef ? { resultRef: view.resultRef } : {}) }));
      await accept(view.status);
      return { runId: ctx.runId, status: view.status };
    },
  };
}
