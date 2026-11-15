// Assignment binding on the run stream (WP-23). A run opened from an `assignment.v1` payload records, on its own
// stream: `assignment.issued` and `assignment.started` (with `run.started`), then `assignment.interrupted`,
// `assignment.resumed` and one terminal `assignment.completed|failed|cancelled`, each carrying a contract `Event`
// as payload; plus `assignment.spend` for every reported spend. Everything is a fold over those events, so the
// assignment state is never a stored copy. The lifecycle rules are the pure ones of `runtime-api`.
import { ConcurrencyError, fingerprint, IdempotencyMismatchError, type Json, type NewEvent, type StoredEvent } from "@godspeedai/cognate-events";
import {
  addSpend, type Assignment, type AssignmentEvent, type AssignmentEventName, type AssignmentLifecycle, AssignmentRefusedError, type AssignmentService, type AssignmentView, budgetBreaches, type BudgetBreach, type Caller, CURRENCIES,
  type Currency, ServiceError, type SpendEntry, spendOf, stepAssignment, validateAssignmentEvent,
} from "@godspeedai/cognate-runtime-api";
import type { Core } from "./core.ts";
import { field, foldRun, meta, runStream } from "./fold.ts";

export const ASSIGNMENT_EVENT_PREFIX = "assignment.";
/** Records collection holding one entry per assignment id (tenant-qualified): the run it was opened as. */
export const ASSIGNMENTS = "assignments";
export const ASSIGNMENT_SPEND_EVENT = "assignment.spend";
const TEXT_MAX = 4096;
const clamp = (text: string): string => (text.length === 0 ? "none" : text.length > TEXT_MAX ? text.slice(0, TEXT_MAX) : text);

/** The assignment frozen on `run.started`, if the run was opened from one. */
export function assignmentOf(started: StoredEvent | undefined): Assignment | undefined {
  const value = started ? field<Json>(meta(started), "assignment") : null;
  return value && typeof value === "object" ? (value as unknown as Assignment) : undefined;
}

/** The assignment state folded from a run stream; `undefined` when the run has no assignment. */
export function foldAssignment(runId: string, events: readonly StoredEvent[]): AssignmentView | undefined {
  const started = events[0];
  const assignment = assignmentOf(started);
  if (!started || !assignment) return undefined;
  const sequence: AssignmentEvent[] = [];
  let spend: readonly SpendEntry[] = spendOf(0);
  let acceptedSpend: readonly SpendEntry[] = spendOf(0);
  let exceeded: readonly BudgetBreach[] | undefined;
  for (const event of events) {
    if (!event.eventType.startsWith(ASSIGNMENT_EVENT_PREFIX)) continue;
    const payload = event.payload as unknown as Record<string, unknown>;
    if (event.eventType === ASSIGNMENT_SPEND_EVENT) {
      spend = payload.spend as SpendEntry[];
      if (Array.isArray(payload.exceeded) && payload.exceeded.length) exceeded = payload.exceeded as BudgetBreach[];
      else acceptedSpend = spend;
    } else {
      sequence.push(payload as unknown as AssignmentEvent);
      acceptedSpend = (payload as unknown as AssignmentEvent).spend;
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

export function createAssignmentService(core: Core): AssignmentService {
  const { store } = core;

  const authorize = async (caller: Caller, action: "assignment.interrupt" | "assignment.resume" | "assignment.spend", resource: string): Promise<void> => {
    const decision = await core.governor.govern({ kind: "action", action, caller, resource });
    if (!decision.allow) throw new ServiceError("permission_denied", decision.reason);
  };

  async function load(caller: Caller, runId: string) {
    const events = await store.readStream(runStream(runId));
    const run = foldRun(runId, events);
    if (!run || run.tenant !== caller.tenant) throw new ServiceError("not_found", `run ${runId} not found`);
    const view = foldAssignment(runId, events);
    if (!view) throw new ServiceError("failed_precondition", `run ${runId} was not opened from an assignment`);
    return { events, run, view };
  }

  /** Commit events on the run stream. `replay` ids make a redelivered request a no-op returning the same state. */
  async function append(caller: Caller, action: string, idempotencyKey: string, requestFingerprint: Json, runId: string, build: (events: readonly StoredEvent[], view: AssignmentView, ids: readonly string[]) => readonly NewEvent[]): Promise<AssignmentView> {
    const scope = `${caller.tenant}:${caller.actor.id}:${action}`;
    const base = fingerprint({ scope, key: idempotencyKey, request: requestFingerprint });
    for (let attempt = 0; attempt < 5; attempt++) {
      const { events, view } = await load(caller, runId);
      // A redelivered request finds its own first event (the id derives from the scope, key and request) and is a no-op.
      if (events.some((e) => e.eventId === `asg_${base}_0`)) return view;
      const built = build(events, view, [0, 1, 2].map((i) => `asg_${base}_${i}`));
      const withIds = built.map((event, i) => ({ ...event, eventId: `asg_${base}_${i}` }));
      try {
        await store.commit({
          idempotency: { scope, key: idempotencyKey, fingerprint: base },
          appends: [{ streamId: runStream(runId), expectedVersion: events.length, events: withIds }],
          outbox: withIds.flatMap((event, i) => core.outboxFor({ ...event, streamId: runStream(runId), recordedAt: event.occurredAt, streamSequence: events.length + i + 1 })),
          result: { runId },
        });
        return (await load(caller, runId)).view;
      } catch (error) {
        if (error instanceof ConcurrencyError) continue;
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
      causationId: index === 0 ? events.at(-1)!.eventId : null,
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
      const view = await append(caller, "assignment.interrupt", request.idempotencyKey, { runId: request.runId, reason: request.reason }, request.runId, (events, current, ids) => {
        const at = new Date().toISOString();
        const event = lifecycleEvent(current.assignment, "interrupted", at, current.acceptedSpend, request.reason);
        acceptLifecycleEvent(current, current.assignment, event, current.linkExpiresAt);
        return [{ ...envelope(events, 0, "assignment.interrupted", event as unknown as Json, assignmentMetadata("interrupted", { by: caller.actor.id }), at) }];
      });
      stopExecution(request.runId, "assignment interrupted");
      return view;
    },

    async resumeAssignment(caller, request) {
      await authorize(caller, "assignment.resume", request.runId);
      const view = await append(caller, "assignment.resume", request.idempotencyKey, { runId: request.runId }, request.runId, (events, current, ids) => {
        const at = new Date().toISOString();
        const linkExpiresAt = current.linkExpiresAt;
        const event = lifecycleEvent(current.assignment, "resumed", at, current.acceptedSpend);
        acceptLifecycleEvent(current, current.assignment, event, linkExpiresAt);
        return [{ ...envelope(events, 0, "assignment.resumed", event as unknown as Json, assignmentMetadata("resumed", { by: caller.actor.id }), at) }];
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
      let stopped = false;
      const view = await append(caller, "assignment.spend", request.idempotencyKey, { runId: request.runId, currency: request.currency, amount }, request.runId, (events, current, ids) => {
        if (current.status !== "started" && current.status !== "resumed") {
          throw new AssignmentRefusedError("ASSIGNMENT_TRANSITION_INVALID", `spend cannot be recorded while the assignment is ${current.status}`);
        }
        const at = new Date().toISOString();
        const spend = addSpend(current.spend, request.currency as Currency, amount);
        const breaches = budgetBreaches(current.assignment.budget, spend);
        const detail = { assignment_id: current.assignment.assignment_id, episode_ref: current.assignment.episode_ref, at, currency: request.currency, amount, spend };
        if (breaches.length === 0) return [{ ...envelope(events, 0, ASSIGNMENT_SPEND_EVENT, detail as unknown as Json, assignmentMetadata("spend", { exceeded: false }), at) }];
        // The overrun is recorded, then the run is stopped. The lifecycle `failed` carries the last in-budget spend, so
        // every lifecycle event stays acceptable to the contract (a spend above a limit is refused there).
        stopped = true;
        const code = "ASSIGNMENT_BUDGET_EXCEEDED";
        const why = breaches.map((b) => `${b.currency} ${b.spent} > ${b.limit}`).join(", ");
        const failed = lifecycleEvent(current.assignment, "failed", at, current.acceptedSpend, `${code}: ${why}`);
        acceptLifecycleEvent(current, current.assignment, failed, current.linkExpiresAt);
        return [
          { ...envelope(events, 0, ASSIGNMENT_SPEND_EVENT, { ...detail, exceeded: breaches, code } as unknown as Json, assignmentMetadata("spend", { exceeded: true }), at) },
          { ...envelope(events, 1, "assignment.failed", failed as unknown as Json, assignmentMetadata("failed"), at), causationId: ids[0]! },
          { ...envelope(events, 2, "run.failed", { error: `${code}: ${why}` }, { agent: field<string>(meta(events[0]!), "agent") ?? "" }, at), causationId: ids[1]! },
        ];
      });
      if (stopped) {
        stopExecution(request.runId, "assignment budget exceeded");
        for (const c of await core.continuations.list({ runId: request.runId, status: "OPEN" })) {
          await core.continuations.cancel(c.id, { actor: caller.actor, idempotencyKey: `assignment.budget:${request.idempotencyKey}:${c.id}`, reason: "ASSIGNMENT_BUDGET_EXCEEDED" });
        }
      }
      return view;
    },
  };
}
