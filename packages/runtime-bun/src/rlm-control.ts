// The RLM control stream: the one runtime-owned record of every RLM admission, dispatch intent, cancellation,
// revocation and accepted outcome of a parent run (PR #94 delta-5, D1).
//
// It is a stream of its own, `rlm-control/<parentRunId>`, like the assignment control stream: generic run state
// (`state.changed`, snapshots, `updateState`) can never write to it, and every decision folds it and appends with a
// compare-and-set on its version, so the stream owns every input to the decision. A cancel, a revocation and a
// dispatch intent are therefore totally ordered: whichever commits first wins, and the loser re-reads.
import { ConcurrencyError, fingerprint, type DurableStore, type Json, type NewEvent, type StoredEvent } from "@godspeedai/cognate-events";
import { ServiceError } from "@godspeedai/cognate-runtime-api";
import { runStream } from "./fold.ts";

/** Carried in `run.started` metadata of every child admitted by this protocol. A child without it is a pre-change history. */
export const RLM_PROTOCOL = 2;

export const rlmControlStream = (parentRunId: string): string => `rlm-control/${parentRunId}`;

export const RLM_EVENTS = {
  admitted: "rlm.admitted",
  childStarted: "rlm.child.started",
  dispatchIntended: "rlm.dispatch.intended",
  dispatchAborted: "rlm.dispatch.aborted",
  cancelRequested: "rlm.cancel.requested",
  cancelSettled: "rlm.cancel.settled",
  revoked: "rlm.revoked",
  parentCancelled: "rlm.parent.cancelled",
  outcomeAccepted: "rlm.outcome.accepted",
} as const;

export type CancelOutcome = "cancelled" | "not-dispatched" | "failed" | "unknown";

/** One invocation as the control stream records it. */
export interface RlmInvocationFold {
  readonly invocationId: string;
  readonly attempt: number;
  readonly childRunId: string;
  readonly parentRunId: string;
  readonly providerId: string;
  readonly depth: number;
  readonly taskKey: string;
  readonly requestFingerprint: string;
  readonly budgetLimit: number | "unknown";
  readonly reservationRef?: string;
  readonly admittedAt: string;
  readonly protocolVersion: number;
  started: boolean;
  dispatchIntended: boolean;
  /** The dispatch step refused (a withdrawn grant or a cancel after the intent) before the provider was ever called. */
  neverInvoked?: boolean;
  /** The principal the child runs as, and the canonical case context, as admitted: a start must present exactly these. */
  principalId?: string;
  caseContextFingerprint?: string;
  cancel?: { requestedAt: string; reason: string; settled?: { outcome: CancelOutcome; errorClass?: string; at: string } };
  accepted?: { status: string; at: string };
}

export interface RlmControlState {
  /** The stream version a decision made on this fold commits against. */
  readonly version: number;
  readonly invocations: Map<string, RlmInvocationFold>;
  readonly revoked: Map<string, string>;
  parentCancelled?: string;
}

const obj = (value: Json | undefined): Record<string, Json> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json>) : {});

export function foldControl(events: readonly StoredEvent[]): RlmControlState {
  const state: RlmControlState = { version: events.length, invocations: new Map(), revoked: new Map() };
  for (const event of events) {
    // Identifiers live in metadata too, so the stream stays attributable when a payload is erased; payload wins when present.
    const m = obj((event.metadata ?? {}) as Json);
    const p = obj(event.payload);
    const id = typeof p.invocationId === "string" ? p.invocationId : typeof m.invocationId === "string" ? m.invocationId : undefined;
    const inv = id !== undefined ? state.invocations.get(id) : undefined;
    switch (event.eventType) {
      case RLM_EVENTS.admitted: {
        if (id === undefined || inv) break; // the first admission of an invocationId is the only one
        state.invocations.set(id, {
          invocationId: id,
          attempt: Number(p.attempt ?? m.attempt ?? 1),
          childRunId: String(p.childRunId ?? m.childRunId),
          parentRunId: String(p.parentRunId ?? m.parentRunId),
          // An erased admission payload leaves a fold that can never match a request (fail closed), but still counts as an attempt.
          providerId: String(p.providerId ?? "erased"),
          depth: Number(p.depth ?? 1),
          taskKey: String(p.taskKey ?? `erased:${id}`),
          requestFingerprint: String(p.requestFingerprint ?? "erased"),
          ...(typeof p.principalId === "string" ? { principalId: p.principalId } : {}),
          ...(typeof p.caseContextFingerprint === "string" ? { caseContextFingerprint: p.caseContextFingerprint } : {}),
          budgetLimit: p.budgetLimit === "unknown" ? "unknown" : Number(p.budgetLimit),
          ...(typeof p.reservationRef === "string" ? { reservationRef: p.reservationRef } : {}),
          admittedAt: String(p.admittedAt ?? event.occurredAt),
          protocolVersion: Number(p.protocolVersion ?? RLM_PROTOCOL),
          started: false,
          dispatchIntended: false,
        });
        break;
      }
      case RLM_EVENTS.childStarted:
        if (inv && (p.childRunId ?? m.childRunId) === inv.childRunId) inv.started = true;
        break;
      case RLM_EVENTS.dispatchIntended:
        if (inv) inv.dispatchIntended = true;
        break;
      case RLM_EVENTS.dispatchAborted:
        if (inv) inv.neverInvoked = true;
        break;
      case RLM_EVENTS.cancelRequested:
        if (inv && !inv.cancel) inv.cancel = { requestedAt: String(p.at ?? event.occurredAt), reason: String(p.reason ?? "rlm.cancel") };
        break;
      case RLM_EVENTS.cancelSettled:
        if (inv?.cancel) inv.cancel.settled = { outcome: p.outcome as CancelOutcome, ...(typeof p.errorClass === "string" ? { errorClass: p.errorClass } : {}), at: String(p.at ?? event.occurredAt) };
        break;
      case RLM_EVENTS.revoked:
        {
          const key = typeof p.key === "string" ? p.key : typeof m.key === "string" ? m.key : undefined;
          if (key !== undefined) state.revoked.set(key, typeof p.reason === "string" ? p.reason : "revoked");
        }
        break;
      case RLM_EVENTS.parentCancelled:
        state.parentCancelled ??= String(p.reason ?? "parent cancelled");
        break;
      case RLM_EVENTS.outcomeAccepted:
        if (inv && !inv.accepted) inv.accepted = { status: String(p.status), at: String(p.at ?? event.occurredAt) };
        break;
    }
  }
  return state;
}

export async function readControl(store: DurableStore, parentRunId: string): Promise<RlmControlState> {
  return foldControl(await store.readStream(rlmControlStream(parentRunId)));
}

/** Why a dispatch under this control state is withdrawn, if it is: a revocation of this invocation or of all, or a cancelled parent. */
export function withdrawnReason(state: RlmControlState, invocationId: string): string | undefined {
  if (state.parentCancelled !== undefined) return `parent run was cancelled (${state.parentCancelled})`;
  const reason = state.revoked.get(invocationId) ?? state.revoked.get("*");
  return reason === undefined ? undefined : `parent authority was revoked (${reason})`;
}

/** The tenant, correlation and scope every control event of a parent carries, taken from the parent's own `run.started`. */
export async function controlEnvelope(store: DurableStore, parentRunId: string): Promise<{ tenant: string; correlationId: string; scopeId: string }> {
  const first = (await store.readStream(runStream(parentRunId)))[0];
  if (!first) throw new Error(`run ${parentRunId} does not exist`);
  return { tenant: first.tenant, correlationId: first.correlationId, scopeId: first.scopeId };
}

export interface ControlEventInput {
  readonly eventType: string;
  readonly payload: Record<string, Json>;
  /** Non-sensitive identifiers: they stay attributable when a payload is erased. */
  readonly metadata: Record<string, Json>;
}

export function controlEvent(envelope: { tenant: string; correlationId: string; scopeId: string }, parentRunId: string, input: ControlEventInput, causationId: string | null = null): NewEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: input.eventType,
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    tenant: envelope.tenant,
    correlationId: envelope.correlationId,
    causationId,
    runId: parentRunId,
    scopeId: envelope.scopeId,
    payload: { ...input.payload, at: new Date().toISOString() },
    metadata: { ...input.metadata, parentRunId },
  };
}

/** Append control events with a compare-and-set on the version they were decided against; `ConcurrencyError` means decide again. */
export async function appendControl(store: DurableStore, parentRunId: string, expectedVersion: number, events: readonly ControlEventInput[]): Promise<void> {
  const envelope = await controlEnvelope(store, parentRunId);
  await store.commit({ appends: [{ streamId: rlmControlStream(parentRunId), expectedVersion, events: chainControl(envelope, parentRunId, events, (await store.readStream(rlmControlStream(parentRunId))).at(-1)?.eventId ?? null) }] });
}

/** Control events of one commit, each caused by the one before it (the first by the stream's last event). */
export function chainControl(envelope: { tenant: string; correlationId: string; scopeId: string }, parentRunId: string, events: readonly ControlEventInput[], lastEventId: string | null): NewEvent[] {
  const out: NewEvent[] = [];
  let cause = lastEventId;
  for (const input of events) {
    const event = controlEvent(envelope, parentRunId, input, cause);
    out.push(event);
    cause = event.eventId!;
  }
  return out;
}

/** The stream's version and its last event id: what a guarded commit that touches the stream decides against. */
export async function controlTail(store: DurableStore, parentRunId: string): Promise<{ version: number; lastEventId: string | null }> {
  const events = await store.readStream(rlmControlStream(parentRunId));
  return { version: events.length, lastEventId: events.at(-1)?.eventId ?? null };
}

/**
 * Decide-and-append under a compare-and-set: `decide` reads the fold and returns the events to append (none to keep the
 * state as it is); a lost race re-reads and decides again. Returns the state the decision committed against.
 */
export async function decideControl<T = void>(store: DurableStore, parentRunId: string, decide: (state: RlmControlState) => Promise<{ events: readonly ControlEventInput[]; result: T }> | { events: readonly ControlEventInput[]; result: T }): Promise<T> {
  for (let attempt = 0; attempt < 24; attempt++) {
    const state = await readControl(store, parentRunId);
    const decision = await decide(state);
    if (decision.events.length === 0) return decision.result;
    try {
      await appendControl(store, parentRunId, state.version, decision.events);
      return decision.result;
    } catch (error) {
      if (!(error instanceof ConcurrencyError)) throw error;
    }
  }
  throw new Error(`rlm control stream of run ${parentRunId} is too contended`);
}

// ── the admitted request ────────────────────────────────────────────────────────

/** The canonical input of an admitted child: what the admission fingerprints and what the child starts from. */
export function childInputOf(request: {
  readonly invocationId: string;
  readonly providerId: string;
  readonly parent: { readonly runId: string; readonly depth: number; readonly maxDepth: number };
  readonly attempt: number;
  readonly task: Json;
  readonly authority: Json;
  readonly budget: Json;
  readonly caseContext?: Json;
}): Json {
  return {
    invocationId: request.invocationId,
    providerId: request.providerId,
    runId: request.parent.runId,
    depth: request.parent.depth + 1,
    maxDepth: request.parent.maxDepth,
    attempt: request.attempt,
    task: request.task,
    authority: request.authority,
    budget: request.budget,
    ...(request.caseContext ? { caseContext: request.caseContext } : {}),
  };
}

export const requestFingerprint = (childInput: Json): string => fingerprint(childInput);

/**
 * The identity of a task for attempt exclusion: computed by the runtime from the task's own fields. A caller-declared
 * `contextDigest` is deliberately not part of it (the runtime has no resolver to verify that digest against the context
 * it names, so a declared value cannot decide whether two invocations are the same job).
 */
export function taskKeyOf(task: { readonly purpose?: unknown; readonly acceptance?: unknown; readonly contextRefs?: unknown }): string {
  return fingerprint({ purpose: (task.purpose ?? null) as Json, acceptance: (task.acceptance ?? null) as Json, contextRefs: (task.contextRefs ?? null) as Json });
}

/** A key for an internal idempotent write, from a structured tuple (never a joined string a caller could shape). */
export const structuredKey = (kind: string, ...parts: readonly string[]): string => `${kind}:${fingerprint(parts as unknown as Json)}`;

// ── the service boundary: a child exists only for an admitted invocation ────────

export interface AdmittedChild {
  /** The principal and case context the admission recorded: the start must be made by exactly this principal with exactly this context. */
  readonly principalId: string | undefined;
  readonly caseContextFingerprint: string | undefined;
  readonly childRunId: string;
  readonly parentRunId: string;
  /** The control version the start commits against (it appends `rlm.child.started` there, atomically with `run.started`). */
  readonly version: number;
  readonly started: boolean;
}

/**
 * Validates a start of `agent.rlm` against the control stream: the input must be exactly the admitted request of an
 * admitted invocation of a parent in the caller's tenant that is neither cancelled, revoked nor withdrawn. Anything else is
 * refused, so a caller holding only the right to start runs cannot obtain a child (or a second one) by naming a parent.
 */
export async function admitChildStart(store: DurableStore, caller: { readonly tenant: string }, input: Json): Promise<AdmittedChild> {
  const refuse = (why: string): never => {
    throw new ServiceError("failed_precondition", `agent.rlm is started only for an admitted invocation: ${why}`);
  };
  const i = obj(input);
  const parentRunId = i.runId;
  const invocationId = i.invocationId;
  if (typeof parentRunId !== "string" || typeof invocationId !== "string") return refuse("the input names no parent run and invocation");
  const first = (await store.readStream(runStream(parentRunId)))[0];
  if (!first || first.tenant !== caller.tenant) return refuse(`parent run ${parentRunId} is not visible to this caller`);
  const control = await readControl(store, parentRunId);
  const inv = control.invocations.get(invocationId);
  if (!inv) return refuse(`invocation ${invocationId} was never admitted`);
  if (inv.requestFingerprint !== requestFingerprint(input)) return refuse(`the input is not the request admitted for ${invocationId}`);
  if (inv.cancel) return refuse(`invocation ${invocationId} was cancelled`);
  const withdrawn = withdrawnReason(control, invocationId);
  if (withdrawn) return refuse(withdrawn);
  return { childRunId: inv.childRunId, parentRunId, version: control.version, started: inv.started, principalId: inv.principalId, caseContextFingerprint: inv.caseContextFingerprint };
}
