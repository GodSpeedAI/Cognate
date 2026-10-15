// Durable run execution by deterministic replay (ADR-0011, spec §11, §12).
// Each execution re-reads the run stream, re-enters the agent from the top, and answers every
// RunContext call that already has a recorded result from the stream instead of repeating it.
import { ConcurrencyError, fingerprint, IdempotencyMismatchError, type Json, type NewEvent, type StoredEvent } from "@godspeedai/cognate-events";
import type { Principal, SemanticRef } from "@godspeedai/cognate-kernel-api";
import { applyStateUpdate, type ArtifactInput, ContinuationClosedError, FrontendCapabilityError, foldState, InvocationFailedError, type RemoteCapabilityOffer, type RunContext, StatePatchError, type WaitSpec } from "@godspeedai/cognate-runtime-api";
import type { Core, RecallResultJson } from "./core.ts";
import { field, foldRun, isTerminal, messageOf, meta, RESUME_HANDLER, runStateStream, runStream, threadStateStream, toJson } from "./fold.ts";

/** Internal control flow: the execution stops here (suspended, cancelled, or lost a write race). */
class Halt {
  constructor(readonly retry: boolean) {}
}

export type ExecutionResult = "done" | "retry";

export async function executeOnce(core: Core, runId: string): Promise<ExecutionResult> {
  const streamId = runStream(runId);
  const events = await core.store.readStream(streamId);
  const view = foldRun(runId, events);
  if (!view || isTerminal(view)) return "done";
  const agent = core.agents.get(view.agent);
  const started = events[0]!;

  let version = events.length;
  let lastEventId = events.at(-1)!.eventId;
  const recorded = new Map<string, StoredEvent[]>();
  for (const event of events) {
    const stepId = field<string>(meta(event), "stepId");
    if (stepId) recorded.set(stepId, [...(recorded.get(stepId) ?? []), event]);
  }
  const find = (stepId: string, eventType?: string) => recorded.get(stepId)?.find((e) => eventType === undefined || e.eventType === eventType);

  const controller = new AbortController();
  core.controllers.set(runId, controller);
  const stopForShutdown = () => controller.abort(new Error("runtime closed"));
  if (core.shutdownSignal.aborted) stopForShutdown();
  else core.shutdownSignal.addEventListener("abort", stopForShutdown, { once: true });
  let halted: Halt | undefined;
  const halt = (retry: boolean): never => {
    halted ??= new Halt(retry);
    throw halted;
  };
  const guard = () => {
    if (halted) throw halted;
    if (controller.signal.aborted) halt(false);
  };

  // Appends are serialized so concurrent RunContext calls cannot race on the stream version.
  let writes: Promise<unknown> = Promise.resolve();
  const append = (event: { eventType: string; payload: Json; metadata: { [key: string]: Json }; semanticRef?: SemanticRef | null; componentId?: string | null; fiberId?: string | null }): Promise<StoredEvent> => {
    const run = writes.then(async () => {
      guard();
      const envelope: NewEvent = {
        eventType: event.eventType,
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        tenant: view.tenant,
        correlationId: view.correlationId,
        causationId: lastEventId,
        runId,
        scopeId: started.scopeId,
        payload: event.payload,
        metadata: event.metadata,
        ...(event.semanticRef ? { semanticRef: event.semanticRef } : {}),
        ...(event.componentId ? { componentId: event.componentId } : {}),
        ...(event.fiberId ? { fiberId: event.fiberId } : {}),
      };
      try {
        // Pre-assign the id so hooks can derive intents that commit atomically with the event (spec §13.1).
        const pending = { ...envelope, eventId: crypto.randomUUID(), streamId, recordedAt: envelope.occurredAt };
        const outcome = await core.store.commit({ appends: [{ streamId, expectedVersion: version, events: [{ ...envelope, eventId: pending.eventId }] }], outbox: core.outboxFor(pending) });
        const stored = outcome.events[0]!;
        version += 1;
        lastEventId = stored.eventId;
        return stored;
      } catch (error) {
        if (error instanceof ConcurrencyError) halt(true);
        throw error;
      }
    });
    writes = run.catch(() => {});
    return run;
  };

  const counters = { emit: 0, invoke: 0, artifact: 0 };
  const context: RunContext = {
    runId,
    agent: view.agent,
    tenant: view.tenant,
    scopeId: started.scopeId,
    correlationId: view.correlationId,
    actor: { id: view.startedBy, kind: (field<string>(meta(started), "startedByKind") ?? "user") as Principal["kind"] },
    signal: controller.signal,

    // D1: fn may itself call emit/invoke/artifact. Those calls draw ids from the shared `counters`
    // object; when a step is replayed, fn is never re-run, so the drift it originally caused must be
    // replayed onto `counters` too, or every id born after this step collides with an id already
    // recorded (and is silently dropped — see emit()). We record the net drift in the completion
    // event and, on replay, advance `counters` by it before returning the cached result.
    // Assumption: agent code drives one step/emit/invoke/artifact call at a time (spec's sequential
    // execution model) — concurrent sibling steps racing on the same shared counters can misattribute
    // drift between them and are not supported.
    async step<T extends Json>(id: string, fn: () => T | Promise<T>): Promise<T> {
      guard();
      const stepId = `step:${id}`;
      const done = find(stepId);
      if (done) {
        const drift = field<{ readonly emit?: number; readonly invoke?: number; readonly artifact?: number }>(meta(done), "counters");
        if (drift) {
          counters.emit += drift.emit ?? 0;
          counters.invoke += drift.invoke ?? 0;
          counters.artifact += drift.artifact ?? 0;
        }
        return field(done.payload, "result") as T;
      }
      const before = { ...counters };
      const result = toJson(await fn());
      const drift = { emit: counters.emit - before.emit, invoke: counters.invoke - before.invoke, artifact: counters.artifact - before.artifact };
      await append({ eventType: "run.step.completed", payload: { result }, metadata: { stepId, counters: drift } });
      return result as T;
    },

    async emit(eventType: string, payload: Json): Promise<void> {
      guard();
      const stepId = `emit:${++counters.emit}`;
      if (find(stepId)) return;
      if (eventType.startsWith("run.")) throw new Error(`emit: event type ${eventType} is reserved for the runtime`);
      if (eventType.startsWith("observation.")) throw new Error(`emit: event type ${eventType} is reserved for observation ingestion (RuntimeService.observe) — observations are never run emissions`);
      await append({ eventType, payload: toJson(payload), metadata: { stepId } });
    },

    async invoke(capability: string, input: Json, options?: { readonly version?: string }): Promise<Json> {
      guard();
      const stepId = `invoke:${++counters.invoke}`;
      // G1: progress events share this stepId (so a replayed invoke advances past them like any other
      // recorded event) but are a distinct event type, so the completion check must name it explicitly.
      let done = find(stepId, "run.invocation");
      if (!done) {
        // A crash between a progress call and the final run.invocation event leaves partial progress
        // recorded for this stepId with no completion; re-executing calls the handler again under a
        // fresh attempt number so consumers can discard the earlier partial attempt.
        const priorAttempts = (recorded.get(stepId) ?? [])
          .filter((e) => e.eventType === "run.invocation.progress")
          .map((e) => field<number>(meta(e), "attempt") ?? 0);
        const attempt = priorAttempts.length ? Math.max(...priorAttempts) + 1 : 0;
        let seq = 0;
        const progress = async (payload: Json): Promise<void> => {
          guard();
          await append({ eventType: "run.invocation.progress", payload: toJson(payload), metadata: { stepId, capability, attempt, seq: seq++ } });
        };
        const call = (approval?: { readonly approvalId: string }) =>
          core.invoker.invoke({
            capability,
            ...(options?.version ? { version: options.version } : {}),
            input: toJson(input),
            tenant: view.tenant,
            ...(approval ? { approval } : {}),
            context: { actor: context.actor, correlationId: view.correlationId, causationId: lastEventId, runId, signal: controller.signal, progress },
          });
        // Governance escalation (migration Stage 7). The decision to wait is recorded once, so a replay of
        // this step reuses it rather than asking the authority again (which would open a second approval).
        // The wait is a durable continuation; whoever resumes it, the resume only triggers a *revalidation*
        // with the authority, which alone decides whether the call may proceed.
        const gateStep = `${stepId}:governance`;
        const recordedGate = find(gateStep, "run.governance.escalated");
        let approvalId = recordedGate ? field<string>(meta(recordedGate), "approvalId") : undefined;
        let expiresAt = recordedGate ? field<number>(meta(recordedGate), "expiresAt") : undefined;
        let outcome = approvalId ? undefined : await call();
        guard();
        if (outcome?.escalation) {
          approvalId = outcome.escalation.approvalId;
          expiresAt = outcome.escalation.expiresAt;
          await append({ eventType: "run.governance.escalated", payload: { capability, approvalId }, metadata: { stepId: gateStep, capability, approvalId, expiresAt: expiresAt ?? null } });
        }
        if (approvalId) {
          await context.waitFor(`governance:${stepId}`, {
            type: "governance-approval",
            condition: { kind: "governance_approval", approvalId },
            payload: { capability, approvalId },
            ...(typeof expiresAt === "number" ? { expiresAt } : {}),
          });
          outcome = await call({ approvalId });
          guard();
        }
        if (!outcome) throw new Error("invoke: no outcome");
        done = await append({
          eventType: "run.invocation",
          // Input and result live in the erasable payload (spec §32); routing facts stay in metadata.
          payload: outcome.ok ? { input: toJson(input), result: outcome.value } : { input: toJson(input), failure: outcome.failure },
          metadata: {
            stepId,
            capability,
            providerId: outcome.providerId,
            fiberId: outcome.fiberId,
            decision: outcome.decision as unknown as Json,
            ok: outcome.ok,
            failureKind: outcome.failure?.kind ?? null,
          },
          semanticRef: outcome.semanticRef,
          componentId: outcome.componentId,
          fiberId: outcome.fiberId,
        });
      }
      const m = meta(done);
      if (m.ok === true) return field(done.payload, "result");
      throw new InvocationFailedError(capability, field(done.payload, "failure") ?? { kind: field<string>(m, "failureKind") ?? "failed" });
    },

    async artifact(input: ArtifactInput): Promise<string> {
      guard();
      const n = ++counters.artifact;
      const stepId = `artifact:${n}`;
      const done = find(stepId);
      if (done) return field<string>(meta(done), "artifactId")!;
      const artifactId = `${runId}.artifact.${n}`;
      // Idempotent across a crash between the artifact commit and the run event.
      if (!(await core.store.getRecord("artifacts", artifactId))) {
        await core.artifacts.put({
          id: artifactId,
          name: input.name,
          mediaType: input.mediaType,
          bytes: input.bytes,
          access: { tenant: view.tenant, scopeId: started.scopeId, readers: [...(input.readers ?? [])] },
          runId,
          correlationId: view.correlationId,
          causationId: lastEventId,
          ...(input.representations ? { representations: input.representations } : {}),
        });
      }
      await append({ eventType: "run.artifact", payload: { artifactId }, metadata: { stepId, artifactId } });
      return artifactId;
    },

    async waitFor(id: string, spec: WaitSpec): Promise<Json> {
      guard();
      const stepId = `wait:${id}`;
      const resumed = find(stepId, "run.resumed");
      if (resumed) return field(resumed.payload, "input");
      const closed = find(stepId, "run.wait.closed");
      if (closed) throw new ContinuationClosedError(`continuation ${id} was ${String(field(meta(closed), "status")).toLowerCase()}`);

      const continuationId = `${runId}.wait.${id}`;
      if (!find(stepId, "run.waiting")) {
        if (!(await core.continuations.get(continuationId))) {
          await core.continuations.open({
            id: continuationId,
            type: spec.type,
            tenant: view.tenant,
            runId,
            scopeId: started.scopeId,
            correlationId: view.correlationId,
            causationId: lastEventId,
            condition: spec.condition,
            payload: spec.payload,
            handler: RESUME_HANDLER,
            ...(spec.semanticRef ? { semanticRef: spec.semanticRef } : {}),
            ...(spec.expiresAt !== undefined ? { expiresAt: spec.expiresAt } : {}),
          });
        }
        await append({ eventType: "run.waiting", payload: { type: spec.type }, metadata: { stepId, continuationId }, semanticRef: spec.semanticRef ?? null });
      }

      const record = await core.continuations.get(continuationId);
      guard();
      switch (record?.status) {
        case "RESUMED":
          await append({ eventType: "run.resumed", payload: { input: record.resolution?.input ?? null }, metadata: { stepId, continuationId }, semanticRef: record.semanticRef });
          return record.resolution?.input ?? null;
        case "CANCELLED":
        case "EXPIRED":
        case "FAILED":
          await append({ eventType: "run.wait.closed", payload: { reason: record.resolution?.reason ?? null }, metadata: { stepId, continuationId, status: record.status }, semanticRef: record.semanticRef });
          throw new ContinuationClosedError(`continuation ${id} was ${record.status.toLowerCase()}`);
        default:
          return halt(false);
      }
    },

    async recall(id: string, query: { readonly text: string; readonly k: number }): Promise<RecallResultJson> {
      guard();
      const stepId = `recall:${id}`;
      const done = find(stepId);
      if (done) return (field(done.payload, "result") as unknown as RecallResultJson | null) ?? { status: "degraded", items: [] };
      const result = await core.recall({ text: query.text, k: query.k, actor: context.actor, tenant: view.tenant });
      await append({ eventType: "run.recall", payload: { result: result as unknown as Json }, metadata: { stepId } });
      return result;
    },

    async state(id: string): Promise<Json> {
      guard();
      const stepId = `state:${id}`;
      const done = find(stepId);
      if (done) return field(done.payload, "result") as Json;
      // Fold this run's own stream as committed so far this execution plus the separate caller-write stream
      // (spec §29.1); re-read both fresh so a caller write landed after this execution started is still seen.
      const [runEvents, stateEvents] = await Promise.all([core.store.readStream(streamId), core.store.readStream(runStateStream(runId))]);
      const result = foldState([...runEvents, ...stateEvents]);
      await append({ eventType: "run.step.completed", payload: { result }, metadata: { stepId } });
      return result;
    },

    async sharedState(id: string): Promise<Json> {
      guard();
      const caller = { tenant: view.tenant, actor: context.actor };
      const decision = await core.governor.govern({ kind: "action", caller, action: "thread.state.read", resource: view.correlationId });
      if (!decision.allow) throw new Error(`thread state read denied: ${decision.reason}`);
      return context.step(`shared-state:${id}`, async () => foldState(await core.store.readStream(threadStateStream(view.tenant, view.correlationId))));
    },

    async updateSharedState(id: string, update): Promise<{ readonly state: Json; readonly version: number }> {
      guard();
      const caller = { tenant: view.tenant, actor: context.actor };
      const decision = await core.governor.govern({ kind: "action", caller, action: "thread.state.update", resource: view.correlationId });
      if (!decision.allow) throw new Error(`thread state update denied: ${decision.reason}`);
      return context.step(`shared-state.update:${id}`, async () => {
        const streamId = threadStateStream(view.tenant, view.correlationId);
        for (let attempt = 0; attempt < 5; attempt++) {
          const events = await core.store.readStream(streamId);
          let state: Json;
          try {
            state = applyStateUpdate(foldState(events), update);
          } catch (error) {
            if (error instanceof StatePatchError) throw new Error(`invalid thread state update: ${error.message}`);
            throw error;
          }
          try {
            const outcome = await core.store.commit({
              idempotency: {
                scope: `${view.tenant}:${runId}:thread.state.update`,
                key: id,
                fingerprint: fingerprint({ threadId: view.correlationId, update: toJson(update) }),
              },
              appends: [{
                streamId,
                expectedVersion: events.length,
                events: [{
                  eventType: "state.changed",
                  schemaVersion: 1,
                  occurredAt: new Date().toISOString(),
                  tenant: view.tenant,
                  correlationId: view.correlationId,
                  causationId: events.at(-1)?.eventId ?? lastEventId,
                  runId,
                  scopeId: started.scopeId,
                  payload: toJson(update),
                  metadata: { scope: "thread", threadId: view.correlationId, source: "agent", actor: context.actor.id, stepId: `shared-state.update:${id}` },
                }],
              }],
              result: { state, version: events.length + 1 },
            });
            return outcome.result as { readonly state: Json; readonly version: number };
          } catch (error) {
            if (error instanceof ConcurrencyError) continue;
            if (error instanceof IdempotencyMismatchError) throw new Error(`thread state update ${id} was replayed with different input`);
            throw error;
          }
        }
        throw new Error(`too much contention updating thread state for ${view.correlationId}`);
      });
    },

    async remoteOffers(id: string): Promise<readonly RemoteCapabilityOffer[]> {
      guard();
      const stepId = `remote-offers:${id}`;
      const done = find(stepId);
      if (done) return (field(done.payload, "result") as unknown as readonly RemoteCapabilityOffer[] | null) ?? [];
      const caller = { tenant: view.tenant, actor: context.actor };
      const listed = core.remoteOffers.list(caller, view.agent);
      const allowed = await Promise.all(listed.map(async (offer) => (await core.governor.govern({ kind: "action", action: "remote.offer.invoke", caller, resource: offer.id })).allow));
      const result = listed.filter((_, index) => allowed[index]);
      await append({ eventType: "run.remote_offers", payload: { result: toJson(result as unknown as Json) }, metadata: { stepId } });
      return result;
    },

    async invokeRemoteOffer(id: string, offerId: string, input: Json, options: { readonly expiresAt?: number } = {}): Promise<Json> {
      guard();
      const waitStep = `wait:remote:${id}`;
      // Availability is checked only before the durable selection. A replay resumes the same
      // continuation even after a browser has disconnected or its offer has expired.
      let offer: RemoteCapabilityOffer | undefined;
      if (!find(waitStep, "run.waiting")) {
        offer = core.remoteOffers.take({ tenant: view.tenant, actor: context.actor }, view.agent, offerId);
        if (!offer) throw new FrontendCapabilityError(`remote offer ${offerId} is unavailable`);
        const decision = await core.governor.govern({ kind: "action", caller: { tenant: view.tenant, actor: context.actor }, action: "remote.offer.invoke", resource: offer.id });
        if (!decision.allow) throw new FrontendCapabilityError(`remote offer ${offerId} denied: ${decision.reason}`);
      }
      const selected = offer;
      // On a replay this condition is ignored by waitFor because its recorded wait controls the
      // durable result; use a neutral shape solely to retain the original method contract.
      const result = (await context.waitFor(`remote:${id}`, {
        type: `remote:${selected?.contract.id ?? "selected"}`,
        condition: selected
          ? { kind: "frontend_capability", capability: selected.contract.id, offerId: selected.id, leaseId: selected.leaseId, contractVersion: selected.contract.version }
          : { kind: "frontend_capability" },
        payload: toJson(input),
        ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
      })) as { ok?: boolean; value?: Json; error?: string } | null;
      if (!result || result.ok !== true) throw new FrontendCapabilityError(`remote offer ${offerId} failed: ${result?.error ?? "no result"}`);
      return result.value ?? null;
    },
  };

  try {
    let outcome: { ok: true; value: Json } | { ok: false; error: unknown };
    if (!agent) outcome = { ok: false, error: new Error(`agent ${view.agent} is not registered`) };
    else {
      try {
        guard();
        outcome = { ok: true, value: toJson(await agent.run(field(started.payload, "input"), context)) };
      } catch (error) {
        outcome = { ok: false, error };
      }
    }
    await writes;
    // A sentinel the agent swallowed still wins: the execution is suspended/cancelled, not finished.
    if (halted || controller.signal.aborted) return halted?.retry ? "retry" : "done";
    if (outcome.ok) await append({ eventType: "run.completed", payload: { output: outcome.value }, metadata: { agent: view.agent } });
    else await append({ eventType: "run.failed", payload: { error: messageOf(outcome.error) }, metadata: { agent: view.agent } });
    return "done";
  } catch (error) {
    if (error instanceof Halt) return error.retry ? "retry" : "done";
    throw error;
  } finally {
    core.shutdownSignal.removeEventListener("abort", stopForShutdown);
    if (core.controllers.get(runId) === controller) core.controllers.delete(runId);
  }
}
