// Assignment binding (WP-23). A run opened from an `assignment.v1` payload records, on its run stream:
// `assignment.issued` and `assignment.started` (with `run.started`). Every later lifecycle write (`interrupted`,
// `resumed`, in-budget `spend`, a budget breach and its `failed`, and the terminal `completed|failed|cancelled`) is an
// event on the assignment's lifecycle stream `run-assignment-<runId>` (spec §29.1: operator writes are never foreign
// appends to the run stream, which the executor versions for itself). The lifecycle stream's version is the
// lifecycle revision: every lifecycle write, including the executor's terminal decision and `cancelRun`, commits with
// `expectedVersion` on it, so a control can never succeed after the assignment ended and a terminal event always
// carries the final accepted spend. Executor progress never touches it. Each event carries a contract `Event` as
// payload; the assignment state is a fold over both streams merged by store position, never a stored copy. The
// lifecycle rules are the pure ones of `runtime-api`.
import { ConcurrencyError, fingerprint, IdempotencyMismatchError, type Json, type NewEvent, type OutboxIntent, type StoredEvent } from "@godspeedai/cognate-events";
import {
  addSpend, type Assignment, type AssignmentEvent, type AssignmentEventName, type AssignmentLifecycle, AssignmentRefusedError, type AssignmentService, type AssignmentView, budgetBreaches, type BudgetBreach, type Caller, CURRENCIES,
  type Currency, ServiceError, type SpendEntry, spendOf, stepAssignment, validateAssignmentEvent,
} from "@godspeedai/cognate-runtime-api";
import type { Core } from "./core.ts";
import { assignmentControlStream, field, foldRun, isTerminal, meta, RUN_EXECUTE_TOPIC, runStream } from "./fold.ts";

export const ASSIGNMENT_EVENT_PREFIX = "assignment.";
/** Records collection holding one entry per assignment id (tenant-qualified): the run it was opened as. */
export const ASSIGNMENTS = "assignments";
export const ASSIGNMENT_SPEND_EVENT = "assignment.spend";
const TEXT_MAX = 4096;
const clamp = (text: string): string => (text.length === 0 ? "none" : text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text);

/** What a view shows for the brief once the `run.started` payload holding it has been erased. */
export const ERASED_BRIEF = { instruction: "[erased]", adoptable_problem: "[erased]", domain_meaning: "[erased]", context_refs: [] } as const;

/**
 * The assignment frozen on `run.started`, if the run was opened from one. The binding fields are metadata; the brief is
 * content, so it lives in the erasable payload (`assignmentBrief`) and reads as `ERASED_BRIEF` after erasure.
 */
export function assignmentOf(started: StoredEvent | undefined): Assignment | undefined {
  const value = started ? field<Json>(meta(started), "assignment") : null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const brief = started ? field<Json>(started.payload, "assignmentBrief") : null;
  return { ...(value as object), brief: brief && typeof brief === "object" ? brief : ERASED_BRIEF } as unknown as Assignment;
}

/**
 * The assignment state folded from a run stream and its lifecycle stream, merged by store position; `undefined` when
 * the run has no assignment. The lifecycle stream's version guards every lifecycle write, so no event can follow a
 * terminal one and the fold needs no tie-break.
 */
export function foldAssignment(runId: string, runEvents: readonly StoredEvent[], control: readonly StoredEvent[] = []): AssignmentView | undefined {
  const events = control.length === 0 ? runEvents : [...runEvents, ...control].sort((a, b) => a.position - b.position);
  const started = runEvents[0];
  const assignment = assignmentOf(started);
  if (!started || !assignment) return undefined;
  const sequence: AssignmentEvent[] = [];
  let spend: readonly SpendEntry[] = spendOf(0);
  let acceptedSpend: readonly SpendEntry[] = spendOf(0);
  let exceeded: readonly BudgetBreach[] | undefined;
  for (const event of events) {
    if (!event.eventType.startsWith(ASSIGNMENT_EVENT_PREFIX)) continue;
    // Provenance: an agent emission (`ctx.emit` tags its events with a stepId) is never lifecycle state. The runtime
    // reserves the namespace now; this keeps a pre-reservation history from forging a transition.
    if (field<string>(meta(event), "stepId") !== null) continue;
    // An erased event keeps its envelope; the state it carries (event name, spend totals, breaches) is also in its
    // metadata, which is not content, so the fold survives erasure. Only the free-text `reason` is lost.
    const payload = event.payload as unknown as Record<string, unknown> | null;
    const md = meta(event);
    if (event.eventType === ASSIGNMENT_SPEND_EVENT) {
      const total = payload ? payload.spend : field<Json>(md, "spend");
      if (Array.isArray(total)) spend = total as unknown as SpendEntry[];
      const breaches = payload ? payload.exceeded : field<Json>(md, "breaches");
      if (Array.isArray(breaches) && breaches.length) exceeded = breaches as unknown as BudgetBreach[];
      else acceptedSpend = spend;
    } else if (payload) {
      sequence.push(payload as unknown as AssignmentEvent);
      acceptedSpend = (payload as unknown as AssignmentEvent).spend;
    } else {
      const name = field<string>(md, "assignmentEvent");
      if (typeof name !== "string") continue;
      // Every lifecycle event carries the accepted spend at the time it was recorded, which is the running total here.
      sequence.push({ assignment_id: assignment.assignment_id, episode_ref: assignment.episode_ref, event: name as AssignmentEventName, at: event.occurredAt, spend: acceptedSpend });
    }
  }
  const linkExpiresAt = field<string>(meta(started), "linkExpiresAt");
  const last = sequence.at(-1);
  return {
    runId,
    assignment,
    status: last?.event ?? "issued",
    spend,
    acceptedSpend,
    ...(exceeded ? { budgetExceeded: exceeded } : {}),
    ...(linkExpiresAt ? { linkExpiresAt } : {}),
    events: sequence,
  };
}

/**
 * A pair of streams is torn when the lifecycle stream shows a terminal decision (`assignment.completed|cancelled`) that
 * the run stream read just before it does not: the executor's terminal commit and `cancelRun` write both streams
 * atomically, so that can only be a read that straddled such a commit. A terminal assignment event found on the RUN
 * stream is legacy (the old executor wrote it and the run's terminal in two commits) and is never torn: a crash between
 * them is finished by appending only the missing run terminal. A budget `failed` on the lifecycle stream with the run
 * still running is not torn either: the stop is durable first and the run's `run.failed` follows.
 */
function torn(runId: string, events: readonly StoredEvent[], control: readonly StoredEvent[]): boolean {
  const run = foldRun(runId, events);
  if (!run || isTerminal(run)) return false;
  return control.some((e) => e.eventType === "assignment.completed" || e.eventType === "assignment.cancelled");
}

/**
 * Both streams of a run read as one consistent pair. Ordinary progress does not matter; only a pair whose terminal
 * states disagree is re-read (with a short pause). Never returns a torn pair: exhaustion throws.
 */
export async function readLifecycle(core: Core, runId: string): Promise<{ readonly events: readonly StoredEvent[]; readonly control: readonly StoredEvent[] }> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const events = await core.store.readStream(runStream(runId));
    const control = await core.store.readStream(assignmentControlStream(runId));
    if (!torn(runId, events, control)) return { events, control };
    await Bun.sleep(Math.min(20, 1 + attempt));
  }
  throw new ServiceError("unavailable", `run ${runId} and its assignment could not be read consistently`);
}

/** The assignment view of a run (consistent pair of streams); `undefined` when the run has no assignment. */
export async function readAssignment(core: Core, runId: string): Promise<AssignmentView | undefined> {
  const { events, control } = await readLifecycle(core, runId);
  return foldAssignment(runId, events, control);
}

/** The lifecycle state (id, episode, last event) of a folded view, for `stepAssignment`. */
export const lifecycleOf = (view: AssignmentView): AssignmentLifecycle => ({ assignmentId: view.assignment.assignment_id, episodeRef: view.assignment.episode_ref, status: view.status });

/** A contract `Event` for this assignment. */
export function lifecycleEvent(assignment: Assignment, event: AssignmentEventName, at: string, spend: readonly SpendEntry[], reason?: string): AssignmentEvent {
  return { assignment_id: assignment.assignment_id, episode_ref: assignment.episode_ref, event, at, spend, ...(reason !== undefined ? { reason: clamp(reason) } : {}) };
}

/**
 * Check an event about to be recorded against the contract: payload shape and the pure state machine, with the budget
 * enforced. Throws the contract's refusal; never records anything.
 */
export function acceptLifecycleEvent(view: AssignmentView | undefined, assignment: Assignment, event: AssignmentEvent, linkExpiresAt?: string): AssignmentLifecycle {
  const shape = validateAssignmentEvent(event);
  if (!shape.ok) {
    if (shape.code) throw new AssignmentRefusedError(shape.code, shape.issues.map((i) => `${i.pointer || "/"} ${i.message}`).join("; "));
    throw new ServiceError("invalid_argument", `invalid assignment event: ${shape.issues.map((i) => `${i.pointer || "/"} ${i.message}`).join("; ")}`);
  }
  const result = stepAssignment(view ? lifecycleOf(view) : undefined, event, { budget: assignment.budget, ...(linkExpiresAt ? { linkExpiresAt } : {}) });
  if (!result.ok) throw new AssignmentRefusedError(result.code, result.message);
  return result.state;
}

/** Metadata every assignment event carries besides the frozen case context. */
export const assignmentMetadata = (name: string, extra: { readonly [key: string]: Json } = {}): { readonly [key: string]: Json } => ({ assignmentEvent: name, ...extra });

/** A lost stream-version race on the run stream is retried this many times in all, pausing between attempts. */
export const APPEND_MAX_ATTEMPTS = 8;
/** Pause before retry `attempt` (0-based): 5 ms doubling to a 40 ms cap, jittered to 50-100%; worst case about 195 ms in all. */
export const appendBackoffMs = (attempt: number, random: () => number = Math.random): number => Math.min(40, 5 * 2 ** attempt) * (0.5 + random() / 2);

/** Pause and jitter source for the append retry; tests inject doubles, production uses `Bun.sleep` and `Math.random`. */
export interface AppendPacing {
  readonly sleep?: (ms: number) => Promise<unknown>;
  readonly random?: () => number;
}

/** Why the run of a budget-stopped assignment failed (the contract's code and the breached limits). */
const budgetError = (view: AssignmentView): string | undefined => {
  if (view.status !== "failed" || !view.budgetExceeded) return undefined;
  const why = view.budgetExceeded.map((b) => `${b.currency} ${b.spent} > ${b.limit}`).join(", ");
  return `ASSIGNMENT_BUDGET_EXCEEDED: ${why}`;
};

/** The run terminal that matches an assignment already ended without one: a budget stop or a legacy crash state. */
function missingRunTerminal(view: AssignmentView): { readonly eventType: "run.failed" | "run.completed"; readonly payload: Json } | undefined {
  const budget = budgetError(view);
  if (budget !== undefined) return { eventType: "run.failed", payload: { error: budget } };
  if (view.status === "failed") return { eventType: "run.failed", payload: { error: view.events.at(-1)?.reason ?? "assignment failed" } };
  if (view.status === "completed") return { eventType: "run.completed", payload: { output: null } };
  return undefined;
}

/**
 * Finish a run whose assignment already ended durably without the run's own terminal (a budget breach, or a legacy
 * crash between the two commits the old executor made): record the matching `run.failed`/`run.completed` on the run
 * stream and cancel the run's open continuations. Idempotent, so the breaching call, a cancel, the executor's next pass
 * and a restart can all run it. The decision is already durable, so this only mirrors it; a lost run-stream race (the
 * executor is stopping) is retried with backoff and exhaustion throws. Continuations are cancelled as the runtime
 * (`core.system`), which authorizes the work; the principal that caused the breach is named in the cancel reason only.
 */
export async function finalizeStoppedRun(core: Core, runId: string, actor: Caller["actor"] = core.system, pacing: AppendPacing = {}): Promise<void> {
  const sleep = pacing.sleep ?? ((ms: number) => Bun.sleep(ms));
  const random = pacing.random ?? Math.random;
  let done = false;
  let reason = "ASSIGNMENT_STOPPED";
  let attributedTo = `${actor.kind}:${actor.id}`;
  for (let attempt = 0; attempt < 40 && !done; attempt++) {
    const { events, control } = await readLifecycle(core, runId);
    const run = foldRun(runId, events);
    const view = foldAssignment(runId, events, control);
    const terminal = view ? missingRunTerminal(view) : undefined;
    if (!run || !view || terminal === undefined) return;
    const breachedBy = control.findLast((e) => e.eventType === "assignment.failed");
    const by = field<string>(meta(breachedBy ?? events[0]!), "by");
    const byKind = field<string>(meta(breachedBy ?? events[0]!), "byKind");
    if (budgetError(view) !== undefined) reason = "ASSIGNMENT_BUDGET_EXCEEDED";
    if (breachedBy && by) attributedTo = `${byKind ?? "user"}:${by}`;
    if (isTerminal(run)) {
      done = true;
      break;
    }
    const first = events[0]!;
    const caseContext = field<Json>(meta(first), "caseContext");
    const at = new Date().toISOString();
    const id = `asg_budget_stop_${runId}`;
    const event = { eventId: id, eventType: terminal.eventType, schemaVersion: 1, occurredAt: at, tenant: first.tenant, correlationId: first.correlationId, causationId: events.at(-1)!.eventId, runId, scopeId: first.scopeId, payload: terminal.payload, metadata: { agent: field<string>(meta(first), "agent") ?? "", ...(caseContext ? { caseContext } : {}) } };
    try {
      await core.store.commit({
        appends: [{ streamId: runStream(runId), expectedVersion: events.length, events: [event] }],
        outbox: core.outboxFor({ ...event, streamId: runStream(runId), recordedAt: at, streamSequence: events.length + control.length + 1 }),
      });
      done = true;
    } catch (e) {
      if (!(e instanceof ConcurrencyError)) throw e;
      await sleep(appendBackoffMs(Math.min(attempt, 5), random));
    }
  }
  if (!done) throw new ServiceError("unavailable", `run ${runId} could not be finished after its assignment ended`);
  for (const c of await core.continuations.list({ runId, status: "OPEN" })) {
    try {
      await core.continuations.cancel(c.id, { actor: core.system, idempotencyKey: `assignment.budget:${runId}:${c.id}`, reason: `${reason} (caused by ${attributedTo})` });
    } catch (error) {
      // Another call may have cancelled it first; only a continuation that is still open is a failure.
      if ((await core.continuations.list({ runId, status: "OPEN" })).some((o) => o.id === c.id)) throw error;
    }
  }
}

export function createAssignmentService(core: Core, pacing: AppendPacing = {}): AssignmentService {
  const sleep = pacing.sleep ?? ((ms: number) => Bun.sleep(ms));
  const random = pacing.random ?? Math.random;
  const { store } = core;

  const authorize = async (caller: Caller, action: "assignment.interrupt" | "assignment.resume" | "assignment.spend", resource: string): Promise<void> => {
    const decision = await core.governor.govern({ kind: "action", action, caller, resource });
    if (!decision.allow) throw new ServiceError("permission_denied", decision.reason);
  };

  async function load(caller: Caller, runId: string) {
    const { events, control } = await readLifecycle(core, runId);
    const run = foldRun(runId, events);
    if (!run || run.tenant !== caller.tenant) throw new ServiceError("not_found", `run ${runId} not found`);
    const view = foldAssignment(runId, events, control);
    if (!view) throw new ServiceError("failed_precondition", `run ${runId} was not opened from an assignment`);
    return { events, control, run, view };
  }

  /**
   * Commit lifecycle events on the lifecycle stream under its version (the lifecycle revision): a control that lost a
   * race with another control, the executor's terminal decision or `cancelRun` re-reads and is validated against the
   * state that won, so a control is only reported as succeeded when its event is part of the folded view. Nothing is
   * appended to the run stream, so executor progress cannot conflict. Ids derived from the request make a redelivered
   * request a no-op returning the same state. `execute` also records a durable run.execute intent (resume, breach).
   */
  async function append(caller: Caller, action: string, idempotencyKey: string, requestFingerprint: Json, runId: string, build: (events: readonly StoredEvent[], view: AssignmentView, ids: readonly string[]) => { readonly control: readonly NewEvent[]; readonly execute?: boolean }): Promise<AssignmentView> {
    const scope = `${caller.tenant}:${caller.actor.id}:${action}`;
    const base = fingerprint({ scope, key: idempotencyKey, request: requestFingerprint });
    for (let attempt = 0; attempt < APPEND_MAX_ATTEMPTS; attempt++) {
      const { events, control, view } = await load(caller, runId);
      // A redelivered request finds its own first event (the id derives from the scope, key and request) on either
      // stream (a pre-upgrade control is on the run stream) and is a no-op, before any transition is validated.
      if (control.some((e) => e.eventId === `asg_${base}_0`) || events.some((e) => e.eventId === `asg_${base}_0`)) return view;
      const built = build(events, view, [0, 1, 2].map((i) => `asg_${base}_${i}`));
      const controlEvents = built.control.map((event, i) => ({ ...event, eventId: `asg_${base}_${i}` }));
      const controlId = assignmentControlStream(runId);
      try {
        await store.commit({
          idempotency: { scope, key: idempotencyKey, fingerprint: base },
          appends: [{ streamId: controlId, expectedVersion: control.length, events: controlEvents }],
          outbox: [
            ...(built.execute ? [{ id: `${RUN_EXECUTE_TOPIC}:${runId}:${base}`, topic: RUN_EXECUTE_TOPIC, payload: { runId } } satisfies OutboxIntent] : []),
            // The ordering coordinate of an observation is run-wide: both streams' events so far plus this one.
            ...controlEvents.flatMap((event, i) => core.outboxFor({ ...event, streamId: controlId, recordedAt: event.occurredAt, streamSequence: events.length + control.length + i + 1 })),
          ],
          result: { runId },
        });
        const reloaded = await load(caller, runId);
        // Success is reported only when this request's own event is in what the fold read back.
        if (!reloaded.control.some((e) => e.eventId === `asg_${base}_0`)) throw new ServiceError("unavailable", `control on run ${runId} was committed but is not part of the assignment view`);
        const after = reloaded.view;
        return after;
      } catch (error) {
        if (error instanceof ConcurrencyError) {
          if (attempt < APPEND_MAX_ATTEMPTS - 1) await sleep(appendBackoffMs(attempt, random));
          continue;
        }
        if (error instanceof IdempotencyMismatchError) throw new ServiceError("already_exists", `idempotency key ${idempotencyKey} was used for a different request`);
        throw error;
      }
    }
    throw new ServiceError("unavailable", `too much contention on run ${runId}`);
  }

  const envelope = (events: readonly StoredEvent[], index: number, eventType: string, payload: Json, extra: { readonly [key: string]: Json }, occurredAt = new Date().toISOString()) => {
    const first = events[0]!;
    const caseContext = field<Json>(meta(first), "caseContext");
    return {
      eventType,
      schemaVersion: 1,
      occurredAt,
      tenant: first.tenant,
      correlationId: first.correlationId,
      // Every lifecycle event points at the run stream's tail (the run-stream causation chain); a related event of the
      // same commit (the breach behind a failure) is carried in metadata instead.
      causationId: events.at(-1)!.eventId,
      runId: first.runId,
      scopeId: first.scopeId,
      payload,
      metadata: { ...(caseContext ? { caseContext } : {}), ...extra },
    };
  };

  const stopExecution = (runId: string, why: string) => core.controllers.get(runId)?.abort(new Error(why));

  return {
    async getAssignment(caller, request) {
      return (await load(caller, request.runId)).view;
    },

    async interruptAssignment(caller, request) {
      await authorize(caller, "assignment.interrupt", request.runId);
      const view = await append(caller, "assignment.interrupt", request.idempotencyKey, { runId: request.runId, reason: request.reason }, request.runId, (events, current) => {
        const at = new Date().toISOString();
        const event = lifecycleEvent(current.assignment, "interrupted", at, current.acceptedSpend, request.reason);
        acceptLifecycleEvent(current, current.assignment, event, current.linkExpiresAt);
        return { control: [envelope(events, 0, "assignment.interrupted", event as unknown as Json, assignmentMetadata("interrupted", { by: caller.actor.id }), at)] };
      });
      // Stop only while the durable state still says interrupted: a replayed interrupt after a resume must not abort.
      // A worker in another process observes the committed interrupt at its next execution boundary.
      if (view.status === "interrupted") stopExecution(request.runId, "assignment interrupted");
      return view;
    },

    async resumeAssignment(caller, request) {
      await authorize(caller, "assignment.resume", request.runId);
      const view = await append(caller, "assignment.resume", request.idempotencyKey, { runId: request.runId }, request.runId, (events, current) => {
        const at = new Date().toISOString();
        const event = lifecycleEvent(current.assignment, "resumed", at, current.acceptedSpend);
        acceptLifecycleEvent(current, current.assignment, event, current.linkExpiresAt);
        // The execution intent commits with the resume, so a failed in-process dispatch cannot strand the run.
        return { control: [envelope(events, 0, "assignment.resumed", event as unknown as Json, assignmentMetadata("resumed", { by: caller.actor.id }), at)], execute: true };
      });
      // Run the execution pass again: the run replays its recorded steps and continues.
      void core.execute(request.runId).catch(() => {});
      core.kick();
      return view;
    },

    async recordSpend(caller, request) {
      await authorize(caller, "assignment.spend", request.runId);
      if (!CURRENCIES.includes(request.currency)) throw new ServiceError("invalid_argument", `unknown currency ${String(request.currency)}`);
      const amount = request.amount;
      if (amount !== "unknown" && !(typeof amount === "number" && Number.isFinite(amount) && amount >= 0)) throw new ServiceError("invalid_argument", 'amount must be a number >= 0 or "unknown"');
      const view = await append(caller, "assignment.spend", request.idempotencyKey, { runId: request.runId, currency: request.currency, amount }, request.runId, (events, current, ids) => {
        if (current.status !== "started" && current.status !== "resumed") {
          throw new AssignmentRefusedError("ASSIGNMENT_TRANSITION_INVALID", `spend cannot be recorded while the assignment is ${current.status}`);
        }
        const at = new Date().toISOString();
        const spend = addSpend(current.spend, request.currency as Currency, amount);
        const breaches = budgetBreaches(current.assignment.budget, spend);
        const detail = { assignment_id: current.assignment.assignment_id, episode_ref: current.assignment.episode_ref, at, currency: request.currency, amount, spend };
        if (breaches.length === 0) return { control: [envelope(events, 0, ASSIGNMENT_SPEND_EVENT, detail as unknown as Json, assignmentMetadata("spend", { exceeded: false, spend: spend as unknown as Json }), at)] };
        // The overrun and the durable stop (`assignment.failed`) commit together under the lifecycle revision, so
        // executor progress cannot defeat them. `assignment.failed` carries the last in-budget spend, so every
        // lifecycle event stays acceptable to the contract. The run's own terminal event follows, from the call below,
        // the executor's next pass or a restart (the run.execute intent committed here).
        const code = "ASSIGNMENT_BUDGET_EXCEEDED";
        const why = breaches.map((b) => `${b.currency} ${b.spent} > ${b.limit}`).join(", ");
        const failed = lifecycleEvent(current.assignment, "failed", at, current.acceptedSpend, `${code}: ${why}`);
        acceptLifecycleEvent(current, current.assignment, failed, current.linkExpiresAt);
        return {
          control: [
            envelope(events, 0, ASSIGNMENT_SPEND_EVENT, { ...detail, exceeded: breaches, code } as unknown as Json, assignmentMetadata("spend", { exceeded: true, spend: spend as unknown as Json, breaches: breaches as unknown as Json }), at),
            envelope(events, 1, "assignment.failed", failed as unknown as Json, assignmentMetadata("failed", { breachEventId: ids[0]!, by: caller.actor.id, byKind: caller.actor.kind }), at),
          ],
          execute: true,
        };
      });
      // Derived from the committed state on every call (a retry, or a call after a failed cleanup, finishes it).
      if (view.status === "failed" && view.budgetExceeded) {
        stopExecution(request.runId, "assignment budget exceeded");
        await finalizeStoppedRun(core, request.runId, caller.actor, { sleep, random });
      }
      return view;
    },
  };
}
