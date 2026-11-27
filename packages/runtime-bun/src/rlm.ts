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
  isDefiniteProviderRefusal,
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
import { Halt } from "./executor.ts";
import { runStateStream, toJson } from "./fold.ts";

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

type PatchOp = { readonly op: "add"; readonly path: string; readonly value: Json };
const isObject = (value: Json | undefined): value is Record<string, Json> => !!value && typeof value === "object" && !Array.isArray(value);
const pointer = (segment: string): string => segment.replaceAll("~", "~0").replaceAll("/", "~1");
const isTerminalParentRefusal = (error: unknown): boolean => /is terminal/.test(error instanceof Error ? error.message : String(error));

/** The parent's `/rlm/<table>` containers that are still missing, as patch ops (never a whole-object rewrite). */
function ensureTable(state: Json, table: "invocations" | "revoked"): PatchOp[] {
  const root = isObject(state) ? state.rlm : undefined;
  const ops: PatchOp[] = [];
  if (!isObject(root)) ops.push({ op: "add", path: "/rlm", value: {} });
  if (!isObject(root) || !isObject(root[table])) ops.push({ op: "add", path: `/rlm/${table}`, value: {} });
  return ops;
}

/**
 * Guarded read-modify-write of one leaf of the parent's `/rlm` state. `decide` sees the current leaf (and the whole
 * state) and returns the value to write, or `"keep"` to leave it; it runs against the state at version V and the commit
 * carries `expectedVersion: V`, so anything that changed the state since (this leaf or any other) makes the commit fail
 * and the whole decision is retried on fresh state. No concurrent binding, revocation or cancellation is overwritten, and
 * a scan inside `decide` is atomic with the write. Returns the leaf as it stands afterwards. Only a terminal parent's
 * refusal is the caller's to swallow; every other failure surfaces.
 */
async function commitRlmLeaf(
  service: RuntimeService,
  caller: Caller,
  parentRunId: string,
  table: "invocations" | "revoked",
  key: string,
  decide: (held: Json | undefined, state: Json) => Promise<Json | "keep">,
  idempotencyKey: string,
): Promise<Json | undefined> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const events: StoredEvent[] = [];
    for await (const event of service.events(caller, { runId: parentRunId })) events.push(event);
    const state = foldState(events);
    const root = isObject(state) ? state.rlm : undefined;
    const held = isObject(root) && isObject(root[table]) && Object.hasOwn(root[table], key) ? root[table][key] : undefined;
    const decision = await decide(held, state);
    if (decision === "keep" || (held !== undefined && JSON.stringify(held) === JSON.stringify(decision))) return held;
    const version = events.filter((event) => event.streamId === runStateStream(parentRunId)).length;
    try {
      await service.updateState(caller, {
        runId: parentRunId,
        update: { patch: [...ensureTable(state, table), { op: "add", path: `/rlm/${table}/${pointer(key)}`, value: decision }] },
        idempotencyKey: `${idempotencyKey}:v${version}`,
        expectedVersion: version,
      });
      return decision;
    } catch (error) {
      if (isTerminalParentRefusal(error)) throw error;
      if ((error as { code?: string }).code !== "failed_precondition") throw error;
    }
  }
  throw new Error(`rlm state on run ${parentRunId} is too contended to record ${table}/${key}`);
}

/**
 * Merge an update into a binding: never a replacement. `cancellation` is set once and never dropped (a failed provider
 * cancel may be settled by a later one, keeping the first `requestedAt`); `runId` and `state` never regress.
 */
function mergeBinding(current: RlmInvocationBinding | undefined, update: Partial<RlmInvocationBinding> & Pick<RlmInvocationBinding, "invocationId">): RlmInvocationBinding {
  const base = (current ?? update) as RlmInvocationBinding;
  const incoming = update.cancellation;
  const held = current?.cancellation;
  // A held record is replaced when its provider cancel failed, or when it said "not dispatched" and the child has since turned out to be.
  const upgrade = !held || held.providerCancel === "failed" || (held.dispatched === false && incoming?.dispatched === true);
  const cancellation = incoming && upgrade ? { ...incoming, requestedAt: held?.requestedAt ?? incoming.requestedAt } : (held ?? incoming);
  const runId = current?.runId || update.runId || "";
  const state = current?.state === "started" || update.state === "started" ? "started" : (current?.state ?? update.state);
  return { ...base, ...(current ? { ...update, ...current } : {}), runId, ...(state ? { state } : {}), ...(cancellation ? { cancellation } : {}) };
}

/** Merge-write one binding (see `mergeBinding`); returns the binding as it stands afterwards. */
async function updateBinding(service: RuntimeService, caller: Caller, parentRunId: string, update: Partial<RlmInvocationBinding> & Pick<RlmInvocationBinding, "invocationId">, idempotencyKey: string, guard?: (held: RlmInvocationBinding | undefined, state: Json) => Promise<void>): Promise<RlmInvocationBinding> {
  const written = await commitRlmLeaf(
    service,
    caller,
    parentRunId,
    "invocations",
    update.invocationId,
    async (held, state) => {
      await guard?.(held as RlmInvocationBinding | undefined, state);
      return mergeBinding(held as RlmInvocationBinding | undefined, update) as unknown as Json;
    },
    idempotencyKey,
  );
  return written as unknown as RlmInvocationBinding;
}

/**
 * Withdraw a parent's authority for one invocation (or every invocation with `"*"`): later dispatches under it are
 * refused. A patch of its own key, safe against concurrent binding writes.
 */
export async function revokeRlmGrant(service: RuntimeService, caller: Caller, parentRunId: string, invocationId: string, reason: string): Promise<void> {
  await commitRlmLeaf(service, caller, parentRunId, "revoked", invocationId, async () => reason, `rlm-revoke:${invocationId}`);
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

/** The child run of a binding: its `runId`, or (while the binding is still `pending-start`) the run found by correlation id. */
async function childRunIdOf(service: RuntimeService, caller: Caller, binding: RlmInvocationBinding): Promise<string | undefined> {
  if (binding.runId) return binding.runId;
  return (await service.listRuns(caller, { correlationId: `rlm:${binding.parentRunId}:${binding.invocationId}` }))[0]?.runId;
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
    // The agent records its outcome as a named step (a provider's ctx.emit cannot collide with a step id).
    const result = event.eventType === "run.step.completed" && isObject(event.payload) && isObject(event.payload.result) ? event.payload.result : undefined;
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
  // Running or admitted: the observable difference is whether the child has done anything but start.
  // Once the dispatch intent is durable the provider may be acting: dispatched reads as running (admitted is before that).
  for await (const event of service.events(caller, { runId: childRunId })) if (event.eventType !== "run.started") return "running";
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
    if (input.attempt !== undefined && !(Number.isInteger(input.attempt) && input.attempt >= 1)) throw new RlmRefusedError("rlm-attempt-refused", `attempt must be a positive integer, got ${String(input.attempt)}`);
    // Reuse of an invocationId resolves to the existing binding; it never starts a second child (D4.8).
    const state = await foldRunState(svc, caller, parentRunId);
    const existing = readInvocationBinding(state, input.invocationId);
    if (existing) {
      // One attempt identity is dispatched once. A retry is a new invocationId with its own grant and reservation (D4.8).
      if (input.attempt !== undefined && input.attempt !== (existing.attempt ?? 1)) {
        throw new RlmRefusedError("rlm-invocation-ambiguous", `invocation ${input.invocationId} already holds attempt ${existing.attempt ?? 1}; a retry needs a new invocationId, grant and reservationRef`);
      }
      if (existing.state !== "pending-start") {
        if ((await invocationStatus(svc, caller, existing.runId)) === "unknown") throw new RlmRefusedError("rlm-invocation-ambiguous", `invocation ${input.invocationId} is ambiguous; reconcile it before retrying`);
        return { invocationId: input.invocationId, runId: existing.runId, status: "admitted" };
      }
      // Pending start: the binding was written but the child (or the completed binding) may not have been; finish the start below.
      if (existing.cancellation) throw new RlmRefusedError("rlm-attempt-refused", `invocation ${input.invocationId} was cancelled before it started`);
    }

    // The binding is durable BEFORE the child exists (pending-start), so a child that dispatches at once, a crash, or a
    // lost write after start can always be inspected and cancelled by invocationId. A NEW binding is written only if no
    // prior attempt of the same task is unresolved, decided against the same state version the write commits against, so
    // two concurrent invokes cannot both pass the scan.
    const pending: RlmInvocationBinding = {
      invocationId: input.invocationId,
      runId: "",
      providerId: input.providerId,
      parentRunId,
      depth: input.parent.depth + 1,
      attempt: input.attempt ?? 1,
      contextDigest: input.task.contextDigest,
      admittedAt: new Date().toISOString(),
      budgetLimit: input.budget.limit,
      state: "pending-start",
      ...(input.budget.reservationRef ? { reservationRef: input.budget.reservationRef } : {}),
    };
    const written = await updateBinding(svc, caller, parentRunId, pending, `rlm-mapping:${input.invocationId}:pending`, async (held, current) => {
      if (held) return; // already bound (a re-entry): nothing new is admitted
      const priors = isObject(current) && isObject(current.rlm) && isObject(current.rlm.invocations) ? (current.rlm.invocations as Record<string, Json>) : {};
      for (const prior of Object.values(priors)) {
        const other = prior as unknown as RlmInvocationBinding;
        if (other.parentRunId !== parentRunId || other.contextDigest !== input.task.contextDigest) continue;
        const otherRun = await childRunIdOf(svc, caller, other);
        // A binding cancelled before any child existed is finished (cancelled), not unresolved.
        const otherStatus: RlmInvocationStatus = otherRun ? await invocationStatus(svc, caller, otherRun) : other.cancellation ? "cancelled" : "admitted";
        if (!isTerminalInvocationStatus(otherStatus)) throw new RlmRefusedError("rlm-attempt-refused", `attempt ${other.invocationId} for this task is unresolved (${otherStatus}); reconcile or cancel it before a new attempt`);
      }
      const withdrawn = await grantWithdrawn(svc, caller, parentRunId, input.invocationId);
      if (withdrawn) throw new RlmRefusedError("rlm-authority-exceeds-parent", `${withdrawn}; no new dispatch`);
    });
    // A cancel that landed after the pending write and before the child exists stops the start.
    if (written.cancellation) throw new RlmRefusedError("rlm-attempt-refused", `invocation ${input.invocationId} was cancelled before it started`);

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
    // Merge, never replace: a cancellation recorded in the gap stays, and the child (which checks it before dispatch) is stopped.
    const started = await updateBinding(svc, caller, parentRunId, { invocationId: input.invocationId, runId: child.runId, state: "started" }, `rlm-mapping:${input.invocationId}`);
    if (started.cancellation) {
      await svc.cancelRun(caller, { runId: child.runId, reason: started.cancellation.reason, idempotencyKey: `rlm-cancel:${input.invocationId}` }).catch(() => undefined);
      throw new RlmRefusedError("rlm-attempt-refused", `invocation ${input.invocationId} was cancelled before it started`);
    }
    return { invocationId: input.invocationId, runId: child.runId, status: "admitted" };
  };

  const inspect = async (raw: unknown, ctx: HandlerContext): Promise<Json> => {
    const input = (raw ?? {}) as RlmInspectInput;
    const svc = service();
    const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };
    const binding = await bindingFor(svc, caller, input, ctx.runId, "inspection");
    const runId = await childRunIdOf(svc, caller, binding);
    const status = runId ? await invocationStatus(svc, caller, runId) : "admitted";
    const summary = runId ? await childSummary(svc, caller, runId) : {};
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
      lastEventAt: ('lastEventAt' in summary ? summary.lastEventAt : undefined) ?? binding.admittedAt,
      ...(outcome.reconciled === true ? { reconciled: true } : {}),
    } as unknown as Json;
  };

  const cancel = async (raw: unknown, ctx: HandlerContext): Promise<Json> => {
    const input = (raw ?? {}) as RlmCancelInput;
    const svc = service();
    const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };
    const binding = await bindingFor(svc, caller, input, ctx.runId, "cancellation");
    const reason = input.reason || "rlm.cancel";
    let runId = await childRunIdOf(svc, caller, binding);
    const status: RlmInvocationStatus = runId ? await invocationStatus(svc, caller, runId) : "admitted";
    const terminal = isTerminalInvocationStatus(status);
    // A child that is already terminal is final, except one our own cancel closed whose provider cancel never settled:
    // that retry asks the provider again (a failed or missing record), and only that.
    const prior = binding.cancellation;
    const settled = prior !== undefined && prior.providerCancel !== "failed";
    if (terminal && !(status === "cancelled" && !settled)) return { status: "already-terminal" } as unknown as Json;

    // No child yet (pending start): record the cancellation first, durably and merge-only; the start refuses to proceed
    // and the child refuses to dispatch when they see it. A child that appeared in the meantime is cancelled below.
    if (!runId) {
      await updateBinding(svc, caller, binding.parentRunId, { invocationId: binding.invocationId, cancellation: { requestedAt: new Date().toISOString(), reason, dispatched: false, providerCancel: "not-dispatched" } }, `rlm-cancel-record:${input.invocationId}:pending`).catch((error) => {
        if (!isTerminalParentRefusal(error)) throw error;
      });
      runId = await childRunIdOf(svc, caller, binding);
      if (!runId) return { status: "cancelled", dispatched: false, providerCancel: "not-dispatched" } as unknown as Json;
    }

    // Cancel the child FIRST; only then is "was it dispatched" a settled question (a cancelled child cannot dispatch later).
    if (!terminal) await svc.cancelRun(caller, { runId, reason, idempotencyKey: `rlm-cancel:${input.invocationId}` });
    let dispatched = false;
    for await (const event of svc.events(caller, { runId })) if (event.eventType === DISPATCH_INTENDED) dispatched = true;
    // Before dispatch the provider is not asked to cancel anything.
    let providerCancel: "not-dispatched" | "cancelled" | "failed" = "not-dispatched";
    let error: string | undefined;
    if (dispatched) {
      const entry = options.registry.get(binding.providerId);
      try {
        if (!entry) throw new Error(`provider ${binding.providerId} is not registered`);
        await entry.provider.cancel(runId, reason);
        providerCancel = "cancelled";
      } catch (cause) {
        providerCancel = "failed";
        error = cause instanceof Error ? cause.message : String(cause);
      }
    }
    const cancellation = { requestedAt: new Date().toISOString(), reason, dispatched, providerCancel, ...(error ? { error } : {}) };
    // Durable on the parent's state while the parent is open (merge-only). A terminal parent refuses state writes (the only
    // failure swallowed here); the same facts are then only in this result and the child's own run.cancelled event.
    try {
      await updateBinding(svc, caller, binding.parentRunId, { invocationId: binding.invocationId, cancellation }, `rlm-cancel-record:${input.invocationId}:${prior ? "retry:" + String(prior.requestedAt) : "first"}`);
    } catch (recordError) {
      if (!isTerminalParentRefusal(recordError)) throw recordError;
    }
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
 * The `agent.rlm` child run. It records its dispatch intent durably, then calls `provider.invoke` at most once for
 * one (invocationId, attempt): a re-entry that finds an intent without a recorded result (resume, restart, lost
 * response) never invokes again; it inspects the original invocation and either completes with a verified result,
 * closes failed on a known failure, or parks on the existing `ambiguous-invocation` continuation for an operator.
 * A provider throws `RlmProviderRefusal` to say it definitely did nothing; that fails the child. Any other throw is
 * ambiguous. The outcome is a recorded step (not an emit), so a provider's own emits cannot collide with it, and the
 * provider's ctx cannot emit the reserved `rlm.outcome` / `rlm.dispatch.*` events.
 *
 * BREAKING (#113): `getService` is required for a dispatch. Without it the agent cannot see its parent's cancellation,
 * revocation or its own binding, so it fails closed. Pass the same late-bound `() => runtime.service` that
 * `createRlmComponent` already takes.
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
      const caller: Caller = { actor: ctx.actor, tenant: ctx.tenant };

      // Checked before a dispatch only. A cancelled child, a cancelled parent, a withdrawn grant or a recorded
      // cancellation prevents it, and an agent that cannot observe its parent fails closed rather than dispatching unchecked.
      const assertDispatchable = async (): Promise<void> => {
        if (ctx.signal.aborted) throw new Error("cancelled before dispatch");
        const getService = options.getService;
        if (!getService) throw new RlmRefusedError("rlm-authority-exceeds-parent", "the parent's authority cannot be verified (no service); no dispatch");
        const service = getService();
        const withdrawn = await grantWithdrawn(service, caller, child.runId, child.invocationId);
        if (withdrawn) throw new RlmRefusedError("rlm-authority-exceeds-parent", `${withdrawn}; no new dispatch`);
        const recorded = readInvocationBinding(await foldRunState(service, caller, child.runId), child.invocationId)?.cancellation;
        if (recorded) throw new Error(`cancelled before dispatch (${recorded.reason})`);
        await lastLook();
      };
      // The last thing before the provider is reached: this run's own status (a cancel the local signal never saw, e.g.
      // from another process) and its signal.
      const lastLook = async (): Promise<void> => {
        const service = options.getService?.();
        if (service) {
          const own = await service.getRun(caller, { runId: ctx.runId });
          if (own.status === "cancelled") throw new Error("cancelled before dispatch (this run was cancelled)");
        }
        if (ctx.signal.aborted) throw new Error("cancelled before dispatch");
      };
      // The outcome is a named step, never an emit: an emit id is a counter a provider's own emits can shift.
      const record = (outcome: Json): Promise<Json> => ctx.step("rlm.outcome", async () => toJson({ rlmOutcome: outcome }));
      // A provider may emit its own events but not forge the reserved ones.
      const providerCtx = Object.assign(Object.create(ctx) as typeof ctx, {
        emit: async (eventType: string, payload: Json): Promise<void> => {
          if (RESERVED_EMIT.test(eventType)) throw new Error(`emit: event type ${eventType} is reserved for the rlm agent`);
          return ctx.emit(eventType, payload);
        },
        step: async <T extends Json>(id: string, fn: () => T | Promise<T>): Promise<T> => {
          if (id.startsWith("rlm.")) throw new Error(`step: id ${id} is reserved for the rlm agent`);
          return ctx.step(id, fn);
        },
      });

      // 1. Intent, durable before any provider call. `fresh` is true only in the pass that records it.
      let fresh = false;
      const identity = { invocationId: child.invocationId, providerId: child.providerId, attempt, parentRunId: child.runId };
      await ctx.step("rlm.dispatch.intent", async () => {
        await assertDispatchable();
        fresh = true;
        return toJson({ ...identity, intendedAt: new Date().toISOString() });
      });
      // Observable intent, after the dispatchable check (a refused child never reads as dispatched). It is the first emit of
      // every pass, so its counter is stable; a replay finds it recorded.
      await ctx.emit(DISPATCH_INTENDED, toJson(identity));

      // 2. Dispatch, once. On re-entry the step body runs only when no result was recorded, and then refuses to invoke.
      let dispatch: DispatchRecord;
      try {
        dispatch = (await ctx.step("rlm.dispatch.result", async (): Promise<Json> => {
          if (!fresh) throw new ReentryWithoutResult();
          await assertDispatchable(); // fenced immediately before the provider is reached
          await lastLook(); // and looked at once more as the very last step
          try {
            await entry.provider.invoke(request, spawn, providerCtx);
            return toJson({ returned: true });
          } catch (error) {
            // Runtime control flow (cancel, shutdown, a lost write race) is not the provider's answer.
            if (ctx.signal.aborted || error instanceof Halt) throw error;
            if (isDefiniteProviderRefusal(error)) return toJson({ returned: false, refused: true, refusalCode: error.code });
            // Any other throw after the provider may have acted is a lost response: inspected, never retried.
            return toJson({ returned: false, errorClass: error instanceof Error ? error.name : "non-error" });
          }
        })) as unknown as DispatchRecord;
      } catch (error) {
        if (!(error instanceof ReentryWithoutResult)) throw error;
        dispatch = { returned: false, errorClass: "reentered-without-result" };
      }
      if (dispatch.refused) {
        await record(toOutcome({ status: "failed", evidence: [`provider-refused:${dispatch.refusalCode ?? "refused"}`] }));
        throw new Error(`provider refused the invocation (${dispatch.refusalCode ?? "refused"})`);
      }

      // 3. Inspect the original invocation (recorded, so a replay never re-asks the provider).
      const askProvider = async (): Promise<Json> => {
        try {
          return toJson(await entry.provider.inspect(ctx.runId));
        } catch (error) {
          return unverifiedView(`inspect failed: ${error instanceof Error ? error.name : "non-error"}`);
        }
      };
      const view = (await ctx.step("rlm.dispatch.view", askProvider)) as unknown as InvocationView;

      // A view is verified when it is tied to the original invocation. Right after a clean `invoke` return a view
      // that names no invocation is accepted (the provider is keyed by this child run); on every recovery path it is not.
      const tied = view.invocationId === child.invocationId || (dispatch.returned && view.invocationId === undefined);
      const closed = tied && view.status !== "unknown" && (dispatch.returned || isTerminalInvocationStatus(view.status));
      const threw = dispatch.errorClass ? [`provider-invoke-threw:${dispatch.errorClass}`] : [];
      if (!closed) {
        const resolution = (await ctx.waitFor(`ambiguous:${child.invocationId}`, {
          type: "ambiguous-invocation",
          condition: { kind: "ambiguous_invocation", capability: RLM_CAPABILITIES.invoke, invocationId: child.invocationId, providerId: child.providerId },
          payload: toJson({ invocationId: child.invocationId, providerId: child.providerId, runId: ctx.runId }),
        })) as { readonly failure?: unknown; readonly result?: unknown; readonly override?: unknown } | null;
        // Reconcile against what the provider says now, not the snapshot taken before the wait (recorded for replay).
        const latest = (await ctx.step("rlm.reconcile.view", askProvider)) as unknown as InvocationView;
        const latestTied = latest.invocationId === child.invocationId;
        const failed = !!resolution?.failure;
        const explicit = failed || (resolution?.result !== undefined && resolution.result !== null);
        // A view that does not name this invocation is foreign: none of its spend or evidence is recorded against it.
        const evidence = latestTied ? [...latest.evidence, `provider-view:${latest.status}`, ...threw] : ["foreign view ignored", ...threw];
        if (!explicit) {
          await record(toOutcome({ status: "failed", evidence: [...evidence, "reconciliation stated no outcome"], reconciled: true }));
          throw new RlmRefusedError("rlm-invocation-ambiguous", `reconciliation of ${child.invocationId} must state an explicit result or failure`);
        }
        // An operator's claim of success never overrides a tied provider view that says it did not succeed, unless the
        // operator says so explicitly; the disagreement is recorded either way.
        const contradicted = !failed && latestTied && ["failed", "timedOut", "cancelled"].includes(latest.status);
        if (contradicted && resolution?.override !== true) {
          await record(toOutcome({ status: "failed", evidence: [...evidence, `operator result contradicts provider-view:${latest.status}`], payment: latest.payment, isolation: latest.isolation, reconciled: true }));
          throw new RlmRefusedError("rlm-invocation-ambiguous", `the operator result for ${child.invocationId} contradicts the provider's ${latest.status} view; override: true must be supplied in the original resolution (this invocation is now closed failed)`);
        }
        const status: RlmInvocationStatus = failed ? "failed" : "completed";
        const finalEvidence = contradicted ? [...evidence, `operator override of provider-view:${latest.status}`] : failed && latestTied && latest.status === "completed" ? [...evidence, "operator failure contradicts provider-view:completed"] : evidence;
        await record(toOutcome({ status, evidence: finalEvidence, ...(latestTied ? { payment: latest.payment, isolation: latest.isolation, ...(latest.resultRef && status === "completed" ? { resultRef: latest.resultRef } : {}) } : {}), reconciled: true }));
        return { runId: ctx.runId, status, reconciled: true };
      }
      await record(toOutcome({ status: view.status, evidence: [...view.evidence, ...threw], payment: view.payment, isolation: view.isolation, ...(view.resultRef ? { resultRef: view.resultRef } : {}) }));
      return { runId: ctx.runId, status: view.status };
    },
  };
}
