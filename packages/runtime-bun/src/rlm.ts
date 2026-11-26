// RLM component (CognitiveOS convergence I1, design D1/D2/D4/D5).
//
// Provider-neutral `rlm.providers|invoke|inspect|cancel` over the normal Invoker. An invocation starts
// exactly one `agent.rlm` child run for the parent run and records the `invocationId -> runId` binding in
// the *parent run's state* with the existing `updateState` — there is no second scheduler, store, run
// identity or index. Inspect/cancel are addressed by (parentRunId, invocationId) and re-derive the binding
// from durable state, so they survive restart. An `unknown` effect parks the child on the existing
// `ambiguous-invocation` continuation; there is no `rlm.reconcile`.
import type { Json, StoredEvent } from "@godspeedai/cognate-events";
import type { Component, HandlerContext, Principal, SemanticRef } from "@godspeedai/cognate-kernel-api";
import {
  foldState,
  INVOCATION_STATUSES,
  isTerminalInvocationStatus,
  RLM_AGENT_ID,
  RLM_CAPABILITIES,
  readGrantRevocation,
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
  type RlmInvokeOutput,
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
import { toJson } from "./fold.ts";

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

// ── state helpers (the parent run state is the only index) ──────────────────────

async function foldRunState(service: RuntimeService, caller: Caller, runId: string): Promise<Json> {
  const events: StoredEvent[] = [];
  for await (const event of service.events(caller, { runId })) events.push(event);
  return foldState(events);
}

async function readBinding(service: RuntimeService, caller: Caller, parentRunId: string, invocationId: string): Promise<RlmInvocationBinding | undefined> {
  return readInvocationBinding(await foldRunState(service, caller, parentRunId), invocationId);
}

async function writeBinding(service: RuntimeService, caller: Caller, parentRunId: string, binding: RlmInvocationBinding, idempotencyKey = `rlm-mapping:${binding.invocationId}`): Promise<void> {
  const state = await foldRunState(service, caller, parentRunId);
  const asObject = (value: Json | undefined): Record<string, Json> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {});
  const root = asObject(state);
  const invocations = asObject(root.rlm).invocations;
  const nextRoot = { ...asObject(root.rlm), invocations: { ...asObject(invocations), [binding.invocationId]: binding as unknown as Json } };
  await service.updateState(caller, {
    runId: parentRunId,
    update: { patch: [{ op: "add", path: "/rlm", value: nextRoot }] },
    idempotencyKey,
  });
}

/**
 * Why the parent's authority no longer stands, if it does not: the parent was cancelled, or its state carries a
 * revocation for this invocation. A withdrawn grant prevents a new dispatch; it never reaches back to one already made.
 */
async function grantWithdrawn(service: RuntimeService, caller: Caller, parentRunId: string, invocationId: string): Promise<string | undefined> {
  const parent = await service.getRun(caller, { runId: parentRunId });
  if (parent.status === "cancelled") return `parent run ${parentRunId} was cancelled`;
  const revoked = readGrantRevocation(await foldRunState(service, caller, parentRunId), invocationId);
  return revoked === undefined ? undefined : `parent authority was revoked (${revoked})`;
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

async function bindingFor(service: RuntimeService, caller: Caller, input: { readonly invocationId: string; readonly parentRunId?: string }, ctxRunId: string | undefined, what: string): Promise<RlmInvocationBinding> {
  const { parentRunId } = await parentFor(service, caller, input, ctxRunId, what);
  const binding = await readBinding(service, caller, parentRunId, input.invocationId);
  if (!binding) throw new RlmRefusedError("rlm-invocation-unknown", `invocation ${input.invocationId} is not recorded on run ${parentRunId}`);
  return binding;
}

// ── invocation status (derived from the child run; terminal is stable) ──────────

interface ChildSummary {
  readonly outcome?: Json;
  readonly lastEventAt?: string;
}

async function childSummary(service: RuntimeService, caller: Caller, childRunId: string): Promise<ChildSummary> {
  let outcome: Json | undefined;
  let lastEventAt: string | undefined;
  for await (const event of service.events(caller, { runId: childRunId })) {
    lastEventAt = event.occurredAt;
    if (event.eventType === "rlm.outcome") outcome = event.payload;
  }
  return { ...(outcome !== undefined ? { outcome } : {}), ...(lastEventAt !== undefined ? { lastEventAt } : {}) };
}

const isDispatchIntentRecord = (event: StoredEvent): boolean => {
  if (event.eventType === DISPATCH_INTENDED) return true;
  if (event.eventType !== "run.step.completed") return false;
  const result = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? (event.payload as { readonly result?: Json }).result : undefined;
  return !!result && typeof result === "object" && !Array.isArray(result) && "intendedAt" in result;
};

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
  // Running or admitted: the observable difference is whether the child has done anything but start.
  // The dispatch intent is bookkeeping made before the provider acts, so it does not make the child "running".
  for await (const event of service.events(caller, { runId: childRunId })) if (event.eventType !== "run.started" && !isDispatchIntentRecord(event)) return "running";
  return "admitted";
}

const DEFAULT_PAYMENT: RlmPayment = { currency: "time", spent: "unknown", basis: "unmeasured" };

// ── the component ───────────────────────────────────────────────────────────────

export interface RlmComponentOptions {
  readonly registry: RlmRegistry;
  /** The runtime service, late-bound because the runtime is created after its components (as in `subagent.start`). */
  readonly getService: () => RuntimeService;
  /** This host's admission posture. Default `{ governance: "off", posture: "uncontained-local" }`. */
  readonly admission?: { readonly governance: "on" | "off"; readonly posture: "contained" | "uncontained-local" };
  readonly semanticRef?: SemanticRef;
}

export function createRlmComponent(options: RlmComponentOptions): Component {
  const contract = (id: string) => ({ id, version: "1.0.0", ...(options.semanticRef ? { semanticRef: options.semanticRef } : {}) });
  const service = () => options.getService();

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

    const svc = service();
    const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };
    // Reuse of an invocationId resolves to the existing binding; it never starts a second child (D4.8).
    const existing = await readBinding(svc, caller, parentRunId, input.invocationId);
    if (existing) {
      // One attempt identity is dispatched once. A retry is a new invocationId with its own grant and reservation (D4.8).
      if (input.attempt !== undefined && input.attempt !== (existing.attempt ?? 1)) {
        throw new RlmRefusedError("rlm-invocation-ambiguous", `invocation ${input.invocationId} already holds attempt ${existing.attempt ?? 1}; a retry needs a new invocationId, grant and reservationRef`);
      }
      if ((await invocationStatus(svc, caller, existing.runId)) === "unknown") throw new RlmRefusedError("rlm-invocation-ambiguous", `invocation ${input.invocationId} is ambiguous; reconcile it before retrying`);
      return { invocationId: input.invocationId, runId: existing.runId, status: "admitted" };
    }

    const withdrawn = await grantWithdrawn(svc, caller, parentRunId, input.invocationId);
    if (withdrawn) throw new RlmRefusedError("rlm-authority-exceeds-parent", `${withdrawn}; no new dispatch`);

    // The child principal is derived from the parent run's starter; a provider never supplies one (D4.2).
    const parentView = await svc.getRun(caller, { runId: parentRunId });
    const childPrincipal: Principal = { id: parentView.startedBy || RLM_AGENT_ID, kind: "agent" };
    const childInput: Json = toJson({
      invocationId: input.invocationId,
      providerId: input.providerId,
      runId: parentRunId,
      depth: input.parent.depth + 1,
      maxDepth: input.parent.maxDepth,
      attempt: input.attempt ?? 1,
      task: input.task,
      authority: input.authority,
      budget: input.budget,
      ...(input.caseContext ? { caseContext: input.caseContext } : {}),
    });
    const child = await svc.startRun(
      { actor: childPrincipal, tenant: ctx.tenant },
      { agent: RLM_AGENT_ID, input: childInput, idempotencyKey: `rlm:${input.invocationId}`, correlationId: `rlm:${parentRunId}:${input.invocationId}`, ...(input.caseContext ? { caseContext: input.caseContext } : {}) },
    );
    const binding: RlmInvocationBinding = {
      invocationId: input.invocationId,
      runId: child.runId,
      providerId: input.providerId,
      parentRunId,
      depth: input.parent.depth + 1,
      attempt: input.attempt ?? 1,
      contextDigest: input.task.contextDigest,
      admittedAt: new Date().toISOString(),
      budgetLimit: input.budget.limit,
      ...(input.budget.reservationRef ? { reservationRef: input.budget.reservationRef } : {}),
    };
    await writeBinding(svc, caller, parentRunId, binding);
    return { invocationId: input.invocationId, runId: child.runId, status: "admitted" };
  };

  const inspect = async (raw: unknown, ctx: HandlerContext): Promise<Json> => {
    const input = (raw ?? {}) as RlmInspectInput;
    const svc = service();
    const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };
    const binding = await bindingFor(svc, caller, input, ctx.runId, "inspection");
    const status = await invocationStatus(svc, caller, binding.runId);
    const summary = await childSummary(svc, caller, binding.runId);
    const outcome = summary.outcome && typeof summary.outcome === "object" && !Array.isArray(summary.outcome) ? (summary.outcome as Record<string, Json>) : {};
    const reported = (outcome.payment as unknown as RlmPayment | undefined) ?? DEFAULT_PAYMENT;
    // An unbounded limit cannot be bounded: the recorded spend is authoritative-unknown, never the provider's number (D4.5).
    const payment: RlmPayment = binding.budgetLimit === "unknown" ? { currency: reported.currency, spent: "unknown", basis: "unknown-budget-limit" } : reported;
    const isolation = typeof outcome.isolation === "string" ? outcome.isolation : "none";
    const evidence = Array.isArray(outcome.evidence) ? outcome.evidence : [];
    const resultRef = typeof outcome.resultRef === "string" ? outcome.resultRef : undefined;
    return {
      status,
      ...(resultRef ? { resultRef } : {}),
      evidence,
      payment,
      providerId: binding.providerId,
      isolation,
      lastEventAt: summary.lastEventAt ?? binding.admittedAt,
      ...(outcome.reconciled === true ? { reconciled: true } : {}),
    } as unknown as Json;
  };

  const cancel = async (raw: unknown, ctx: HandlerContext): Promise<Json> => {
    const input = (raw ?? {}) as RlmCancelInput;
    const svc = service();
    const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };
    const binding = await bindingFor(svc, caller, input, ctx.runId, "cancellation");
    if (isTerminalInvocationStatus(await invocationStatus(svc, caller, binding.runId))) return { status: "already-terminal" } as unknown as Json;
    const reason = input.reason || "rlm.cancel";
    // Dispatch intent is durable before any provider call, so its presence is what says a provider may have acted.
    let dispatched = false;
    for await (const event of svc.events(caller, { runId: binding.runId })) if (event.eventType === DISPATCH_INTENDED) dispatched = true;
    await svc.cancelRun(caller, { runId: binding.runId, reason, idempotencyKey: `rlm-cancel:${input.invocationId}` });
    // Before dispatch the cancelled child never dispatches, so the provider is not asked to cancel anything.
    let providerCancel: "not-dispatched" | "cancelled" | "failed" = "not-dispatched";
    let error: string | undefined;
    if (dispatched) {
      const entry = options.registry.get(binding.providerId);
      try {
        if (!entry) throw new Error(`provider ${binding.providerId} is not registered`);
        await entry.provider.cancel(binding.runId, reason);
        providerCancel = "cancelled";
      } catch (cause) {
        providerCancel = "failed";
        error = cause instanceof Error ? cause.message : String(cause);
      }
    }
    const cancellation = { requestedAt: new Date().toISOString(), reason, dispatched, providerCancel, ...(error ? { error } : {}) };
    // Durable on the parent's state while the parent is still open; a terminal parent refuses state writes, and the
    // same facts are then only in this result (and the child's own run.cancelled event).
    await writeBinding(svc, caller, binding.parentRunId, { ...binding, cancellation }, `rlm-cancel-record:${input.invocationId}`).catch(() => {});
    return { status: "cancelled", dispatched, providerCancel, ...(error ? { error } : {}) } as unknown as Json;
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

const DISPATCH_INTENDED = "rlm.dispatch.intended";

/** Thrown inside the dispatch-result step on re-entry, where the provider must not be invoked again. */
class ReentryWithoutResult extends Error {}

interface DispatchRecord {
  readonly returned: boolean;
  readonly error?: string;
}

const unverifiedView = (note: string): Json =>
  toJson({ status: "unknown", evidence: [note], payment: DEFAULT_PAYMENT, isolation: "none", lastEventAt: new Date().toISOString() });

/**
 * The `agent.rlm` child run. It records its dispatch intent durably, then calls `provider.invoke` at most once for
 * one (invocationId, attempt): a re-entry that finds an intent without a recorded result (resume, restart, lost
 * response) never invokes again; it inspects the original invocation and either completes with a verified result,
 * closes failed on a known failure, or parks on the existing `ambiguous-invocation` continuation for an operator.
 * `getService` lets the agent observe the parent run so a withdrawn grant prevents a new dispatch.
 */
export function createRlmAgent(options: { readonly registry: RlmRegistry; readonly spawnPort?: StdioSpawnPort; readonly getService?: () => RuntimeService }): AgentDefinition {
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

      // Before a dispatch only: a cancelled child or a withdrawn parent grant prevents it.
      const assertDispatchable = async (): Promise<void> => {
        if (ctx.signal.aborted) throw new Error("cancelled before dispatch");
        const getService = options.getService;
        if (!getService) return;
        const withdrawn = await grantWithdrawn(getService(), { actor: ctx.actor, tenant: ctx.tenant }, child.runId, child.invocationId);
        if (withdrawn) throw new RlmRefusedError("rlm-authority-exceeds-parent", `${withdrawn}; no new dispatch`);
      };

      // 1. Intent, durable before any provider call. `fresh` is true only in the pass that records it.
      let fresh = false;
      const identity = { invocationId: child.invocationId, providerId: child.providerId, attempt, parentRunId: child.runId };
      await ctx.emit(DISPATCH_INTENDED, toJson(identity));
      const intent = (await ctx.step("rlm.dispatch.intent", async () => {
        await assertDispatchable();
        fresh = true;
        return toJson({ ...identity, intendedAt: new Date().toISOString() });
      })) as unknown as typeof identity;
      if (intent.invocationId !== child.invocationId || intent.attempt !== attempt) {
        throw new RlmRefusedError("rlm-invocation-ambiguous", `invocation ${child.invocationId} attempt ${intent.attempt} is already recorded; attempt ${attempt} needs a new invocationId`);
      }
      if (fresh) await assertDispatchable();

      // 2. Dispatch, once. On re-entry the step body runs only when no result was recorded, and then refuses to invoke.
      let dispatch: DispatchRecord;
      try {
        dispatch = (await ctx.step("rlm.dispatch.result", async (): Promise<Json> => {
          if (!fresh) throw new ReentryWithoutResult();
          try {
            await entry.provider.invoke(request, spawn, ctx);
            return toJson({ returned: true });
          } catch (error) {
            // A throw after the provider may have acted is a lost response, not a failure: it is inspected, never retried.
            if (ctx.signal.aborted) throw error;
            return toJson({ returned: false, error: error instanceof Error ? error.message : String(error) });
          }
        })) as unknown as DispatchRecord;
      } catch (error) {
        if (!(error instanceof ReentryWithoutResult)) throw error;
        dispatch = { returned: false, error: "re-entered with a dispatch intent and no recorded result" };
      }

      // 3. Inspect the original invocation (recorded, so a replay never re-asks the provider).
      const view = (await ctx.step("rlm.dispatch.view", async () => {
        try {
          return toJson(await entry.provider.inspect(ctx.runId));
        } catch (error) {
          return unverifiedView(`inspect failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      })) as unknown as InvocationView;

      // A view is verified when it is tied to the original invocation. Right after a clean `invoke` return a view
      // that names no invocation is accepted (the provider is keyed by this child run); on every recovery path it is not.
      const tied = view.invocationId === child.invocationId || (dispatch.returned && view.invocationId === undefined);
      const closed = tied && view.status !== "unknown" && (dispatch.returned || isTerminalInvocationStatus(view.status));
      if (!closed) {
        const resolution = (await ctx.waitFor(`ambiguous:${child.invocationId}`, {
          type: "ambiguous-invocation",
          condition: { kind: "ambiguous_invocation", capability: RLM_CAPABILITIES.invoke, invocationId: child.invocationId, providerId: child.providerId },
          payload: toJson({ invocationId: child.invocationId, providerId: child.providerId, runId: ctx.runId }),
        })) as { readonly failure?: unknown } | null;
        const failed = !!resolution?.failure;
        const status: RlmInvocationStatus = failed ? "failed" : "completed";
        await ctx.emit("rlm.outcome", toOutcome({ status, evidence: view.evidence, payment: view.payment, isolation: view.isolation, ...(tied && view.resultRef ? { resultRef: view.resultRef } : {}), reconciled: true }));
        return { runId: ctx.runId, status };
      }
      await ctx.emit("rlm.outcome", toOutcome({ status: view.status, evidence: view.evidence, payment: view.payment, isolation: view.isolation, ...(view.resultRef ? { resultRef: view.resultRef } : {}) }));
      return { runId: ctx.runId, status: view.status };
    },
  };
}
