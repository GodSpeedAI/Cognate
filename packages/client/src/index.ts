// CG-CLT-001 (spec §25.1, §31.8): headless client over the runtime service; reconnect from cursor; frontend capabilities.
// All exposed state is DERIVED from durable events -- nothing here is authoritative, everything can be rebuilt
// by replaying the tenant's event stream from position 0. No React import (framework-neutral).
import type { Json, StoredEvent } from "@godspeedai/cognate-events";
import { applyStateUpdate, type Caller, type ContinuationView, type RemoteCapabilityOffer, type RunView, type RuntimeService, StatePatchError, type StateUpdate } from "@godspeedai/cognate-runtime-api";

/** A minimal observable value, framework-neutral (React bindings adapt it with useSyncExternalStore). */
export interface Readable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "closed";

/** Run state derived only from the run's durable events (spec §25.1 shared state; §31.8 reconnect). */
export interface RunState {
  readonly runId: string;
  readonly status: RunView["status"] | "unknown";
  /** Concatenated durable assistant text deltas in stream order. */
  readonly text: string;
  /** Shared state object built from `state.changed` events: `{ patch: JsonPatch }` or `{ snapshot: Json }` payloads. */
  readonly state: Json;
  readonly openContinuations: readonly ContinuationView[];
  readonly artifacts: readonly string[];
  readonly output: Json;
  readonly error: string | null;
  /** Last applied store position. */
  readonly position: number;
}

/** Durable state shared by every run in one caller-authorized thread. */
export interface ThreadSharedState {
  readonly state: Json;
  /** Last folded per-thread state event sequence. */
  readonly version: number;
}

export interface ClientOptions {
  readonly service: RuntimeService;
  readonly caller: Caller;
  /** Reconnect backoff for event streams (default 50 ms doubling to 2 s). */
  readonly reconnect?: { readonly baseMs: number; readonly maxMs: number };
}

export type FrontendHandler = (input: Json, context: { readonly runId: string; readonly continuationId: string }) => Json | Promise<Json>;
export type RemoteCapabilityOfferInput = Omit<RemoteCapabilityOffer, "id" | "scopeId" | "expiresAt"> & { readonly ttlMs?: number };

export interface CognateClient {
  readonly status: Readable<ConnectionStatus>;
  startRun(agent: string, input: Json, options?: { readonly idempotencyKey?: string; readonly correlationId?: string; readonly state?: Json }): Promise<RunView>;
  cancelRun(runId: string, reason: string): Promise<RunView>;
  /** Write a non-terminal run's shared state as the caller; the agent observes it through `RunContext.state` (spec §29.1). */
  updateState(runId: string, update: StateUpdate, options?: { readonly idempotencyKey?: string; readonly expectedVersion?: number }): Promise<{ readonly state: Json; readonly version: number }>;
  /** Live, reconnecting, derived state of one run. */
  run(runId: string): Readable<RunState>;
  /** Live thread state folded from the canonical snapshot and durable thread events. */
  threadSharedState(threadId: string): Readable<ThreadSharedState>;
  /** Write thread state as the caller; runs in the thread observe the durable update. */
  updateThreadSharedState(threadId: string, update: StateUpdate, options?: { readonly idempotencyKey?: string; readonly expectedVersion?: number }): Promise<{ readonly state: Json; readonly version: number }>;
  /** Subscribe to tenant events from a position with automatic resume after disconnect; no gaps, no duplicates. */
  subscribe(options: { readonly afterPosition?: number; readonly runId?: string }, listener: (event: StoredEvent) => void): () => void;
  /** A public projection, refreshed when events commit; refresh() re-reads on demand. */
  projection(name: string): Readable<readonly { readonly key: string; readonly value: Json }[] | undefined> & { readonly refresh: () => void };
  resolveContinuation(continuationId: string, action: "resume" | "cancel", input?: Json, options?: { readonly expectedVersion?: number; readonly reason?: string }): Promise<ContinuationView>;
  /**
   * Serve a frontend capability: open `frontend_capability` continuations naming it are executed locally and
   * resolved with `{ ok, value | error }`. Returns an unregister function.
   */
  provideCapability(capability: string, handler: FrontendHandler): () => void;
  /** Publish a handler's contract for one agent while this client surface is mounted. */
  offerCapability(offer: RemoteCapabilityOfferInput, handler: FrontendHandler): Promise<() => Promise<void>>;
  /** Perform a semantic action through the runtime's authorized capability path. */
  invoke(capability: string, input: Json): Promise<Json>;
  artifact(artifactId: string, representation?: string): Promise<{ readonly name: string; readonly mediaType: string; readonly bytes: Uint8Array }>;
  close(): Promise<void>;
}

// ── Small helpers over the wire shapes ──────────────────────────────────────────

function metaField<T>(event: StoredEvent, key: string): T | undefined {
  const m = event.metadata;
  return m && typeof m === "object" && key in m ? ((m as { [key: string]: Json })[key] as unknown as T) : undefined;
}

function payloadField<T>(event: StoredEvent, key: string): T | undefined {
  const p = event.payload;
  return p && typeof p === "object" && !Array.isArray(p) && key in p ? ((p as { [key: string]: Json })[key] as unknown as T) : undefined;
}

function backoffMs(reconnect: { readonly baseMs: number; readonly maxMs: number }, attempt: number): number {
  return Math.min(reconnect.maxMs, reconnect.baseMs * 2 ** Math.max(0, attempt - 1));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

// ── Generic observable store ────────────────────────────────────────────────────

class SimpleReadable<T> implements Readable<T> {
  private readonly listeners = new Set<(value: T) => void>();
  constructor(private value: T) {}
  get(): T {
    return this.value;
  }
  set(value: T): void {
    if (value === this.value) return;
    this.value = value;
    for (const listener of this.listeners) listener(value);
  }
  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const TERMINAL = new Set<RunView["status"]>(["completed", "failed", "cancelled"]);

/** Folds one run's events into `RunState`; continuations are refreshed (async) alongside status transitions. */
class RunStore implements Readable<RunState> {
  private readonly listeners = new Set<(value: RunState) => void>();
  private status: RunView["status"] | "unknown" = "unknown";
  private text = "";
  private stateJson: Json = null;
  private openContinuations: readonly ContinuationView[] = [];
  private artifacts: readonly string[] = [];
  private output: Json = null;
  private error: string | null = null;
  private position = 0;
  private readonly waiting = new Set<string>();
  private continuationGen = 0;
  private state: RunState;

  constructor(
    private readonly runId: string,
    private readonly service: RuntimeService,
    private readonly caller: Caller,
  ) {
    this.state = this.snapshot();
  }

  get(): RunState {
    return this.state;
  }

  subscribe(listener: (value: RunState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private snapshot(): RunState {
    return {
      runId: this.runId,
      status: this.status,
      text: this.text,
      state: this.stateJson,
      openContinuations: this.openContinuations,
      artifacts: this.artifacts,
      output: this.output,
      error: this.error,
      position: this.position,
    };
  }

  private publish(): void {
    this.state = this.snapshot();
    for (const listener of this.listeners) listener(this.state);
  }

  apply(event: StoredEvent): void {
    this.position = event.position;
    switch (event.eventType) {
      case "run.started":
        this.status = "running";
        this.publish();
        return;
      case "message.delta": {
        const text = payloadField<string>(event, "text");
        if (typeof text === "string") this.text += text;
        this.publish();
        return;
      }
      case "run.invocation.progress": {
        if (event.metadata?.capability !== "model.generate" || payloadField<string>(event, "type") !== "text") return;
        const text = payloadField<string>(event, "text");
        if (typeof text === "string") this.text += text;
        this.publish();
        return;
      }
      case "state.changed": {
        // Same fold semantics as the runtime and `foldState`: a snapshot replaces, a patch applies to the
        // current state, and a patch that does not apply is skipped rather than aborting the client's view
        // (one bad agent-emitted patch cannot hide later, well-formed updates).
        const snapshot = payloadField<Json>(event, "snapshot");
        const patch = payloadField<StateUpdate extends { patch: infer P } ? P : never>(event, "patch");
        try {
          if (snapshot !== undefined) this.stateJson = applyStateUpdate(this.stateJson, { snapshot });
          else if (patch !== undefined) this.stateJson = applyStateUpdate(this.stateJson, { patch });
        } catch (error) {
          if (!(error instanceof StatePatchError)) throw error;
        }
        this.publish();
        return;
      }
      case "run.artifact": {
        const artifactId = payloadField<string>(event, "artifactId");
        if (typeof artifactId === "string") this.artifacts = [...this.artifacts, artifactId];
        this.publish();
        return;
      }
      case "run.completed":
        this.status = "completed";
        this.output = payloadField<Json>(event, "output") ?? null;
        this.waiting.clear();
        this.publish();
        return;
      case "run.failed":
        this.status = "failed";
        this.error = payloadField<string>(event, "error") ?? null;
        this.waiting.clear();
        this.publish();
        return;
      case "run.cancelled":
        this.status = "cancelled";
        this.waiting.clear();
        this.publish();
        return;
      case "run.waiting":
      case "run.resumed":
      case "run.wait.closed": {
        const continuationId = metaField<string>(event, "continuationId");
        if (event.eventType === "run.waiting") {
          if (continuationId) this.waiting.add(continuationId);
        } else if (continuationId) {
          this.waiting.delete(continuationId);
        }
        this.publish();
        void this.refreshContinuations(this.waiting.size > 0 ? "waiting" : "running");
        return;
      }
      default:
        this.publish();
    }
  }

  private async refreshContinuations(pendingStatus: RunView["status"]): Promise<void> {
    const gen = ++this.continuationGen;
    let list = this.openContinuations;
    try {
      list = await this.service.listContinuations(this.caller, { runId: this.runId, status: "OPEN" });
    } catch {
      // transient failure: keep the previous list, still surface the status transition below.
    }
    if (gen !== this.continuationGen) return;
    this.openContinuations = list;
    if (!TERMINAL.has(this.status as RunView["status"])) this.status = pendingStatus;
    this.publish();
  }
}

class ThreadSharedStateStore implements Readable<ThreadSharedState> {
  private value: ThreadSharedState = { state: null, version: 0 };
  private readonly listeners = new Set<(value: ThreadSharedState) => void>();
  private hydrated = false;
  private readonly pending: StoredEvent[] = [];
  private readonly unsubscribe: () => void;

  constructor(
    private readonly threadId: string,
    private readonly service: RuntimeService,
    private readonly caller: Caller,
    subscribe: (listener: (event: StoredEvent) => void) => () => void,
  ) {
    // Subscribe before reading the snapshot. Events arriving while the read is in flight are folded
    // only when newer than that snapshot's per-thread version, closing the read/subscribe race.
    this.unsubscribe = subscribe((event) => {
      if (!this.isThreadEvent(event)) return;
      if (!this.hydrated) this.pending.push(event);
      else this.apply(event);
    });
    void this.hydrate();
  }

  get(): ThreadSharedState {
    return this.value;
  }

  subscribe(listener: (value: ThreadSharedState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  accept(result: ThreadSharedState): void {
    if (result.version < this.value.version) return;
    this.value = result;
    this.publish();
  }

  private async hydrate(): Promise<void> {
    try {
      const snapshot = await this.service.readSharedState(this.caller, { threadId: this.threadId });
      if (snapshot.version > this.value.version) this.value = snapshot;
      this.hydrated = true;
      for (const event of this.pending) this.apply(event);
      this.pending.length = 0;
      this.publish();
    } catch {
      // Leave the current derived value available. The next matching durable event can still advance it.
      this.hydrated = true;
      this.pending.length = 0;
    }
  }

  private isThreadEvent(event: StoredEvent): boolean {
    return event.eventType === "state.changed" && event.correlationId === this.threadId && metaField<string>(event, "scope") === "thread";
  }

  private apply(event: StoredEvent): void {
    if (event.streamSequence <= this.value.version) return;
    if (event.streamSequence !== this.value.version + 1) {
      // A per-thread sequence gap means this projection needs a fresh canonical snapshot.
      void this.refresh();
      return;
    }
    try {
      const snapshot = payloadField<Json>(event, "snapshot");
      const patch = payloadField<StateUpdate extends { readonly patch: infer P } ? P : never>(event, "patch");
      const state = snapshot !== undefined
        ? applyStateUpdate(this.value.state, { snapshot })
        : patch !== undefined
          ? applyStateUpdate(this.value.state, { patch })
          : this.value.state;
      this.value = { state, version: event.streamSequence };
      this.publish();
    } catch (error) {
      if (!(error instanceof StatePatchError)) throw error;
      void this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    try {
      this.accept(await this.service.readSharedState(this.caller, { threadId: this.threadId }));
    } catch {
      // The durable event remains available for replay if the snapshot read is temporarily unavailable.
    }
  }

  private publish(): void {
    for (const listener of this.listeners) listener(this.value);
  }
}

class ProjectionStore implements Readable<readonly { readonly key: string; readonly value: Json }[] | undefined> {
  private readonly listeners = new Set<(value: readonly { readonly key: string; readonly value: Json }[] | undefined) => void>();
  private value: readonly { readonly key: string; readonly value: Json }[] | undefined;
  private gen = 0;
  /** The greatest event position a refresh was scheduled for; a read counts as fresh only when its
   * checkpoint covers this position (DEBT-021). */
  private target = 0;

  constructor(
    private readonly name: string,
    private readonly service: RuntimeService,
    private readonly caller: Caller,
    /** The engine's already-observed position: the initial read must cover it, or keep retrying. */
    initialPosition = 0,
  ) {
    this.scheduleRefresh(initialPosition);
  }

  get(): readonly { readonly key: string; readonly value: Json }[] | undefined {
    return this.value;
  }

  subscribe(listener: (value: readonly { readonly key: string; readonly value: Json }[] | undefined) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  scheduleRefresh(afterPosition?: number): void {
    if (afterPosition !== undefined && afterPosition > this.target) this.target = afterPosition;
    void this.readNow();
  }

  /** Re-read now; a manual refresh must still cover every position a scheduled refresh waits for. */
  refresh(): void {
    void this.readNow();
  }

  /** Stop in-flight convergence loops (engine shutdown); a later refresh starts a fresh one. */
  cancel(): void {
    this.gen += 1;
  }

  /**
   * Re-reads the projection until its checkpoint covers the triggering event's position. The first
   * read is published immediately (the reader sees the best available state right away); a read
   * whose checkpoint is behind the target returns rows the triggering event has not reached yet —
   * the stale read that used to stick forever — so the loop keeps re-reading at a bounded rate
   * (≤ 2 Hz) until covered, cancellable by a newer refresh or engine close. An errored projection
   * stops the loop: the condition surfaces instead of spinning behind it.
   */
  private async readNow(): Promise<void> {
    const gen = ++this.gen;
    let attempt = 0;
    let published = false;
    for (;;) {
      let read: Awaited<ReturnType<RuntimeService["readProjection"]>>;
      try {
        read = await this.service.readProjection(this.caller, { name: this.name });
      } catch {
        return; // transient failure: keep the last published value; a later event or refresh() retries
      }
      if (gen !== this.gen) return;
      const checkpoint = read.checkpoint;
      // No fold yet (null checkpoint) means empty rows; that only covers a target of zero — a pending
      // event position keeps the loop re-reading until the first fold lands (DEBT-021).
      const covered = checkpoint !== null && checkpoint.position >= this.target && checkpoint.status !== "error";
      const nothingPending = checkpoint === null && this.target === 0;
      if (!published) {
        this.value = read.rows;
        for (const listener of this.listeners) listener(this.value);
        published = true;
      }
      if (covered || nothingPending) {
        if (read.rows !== this.value) {
          this.value = read.rows;
          for (const listener of this.listeners) listener(this.value);
        }
        return;
      }
      if (checkpoint?.status === "error") return;
      attempt += 1;
      await sleep(Math.min(500, 25 * 2 ** (Math.min(attempt, 5) - 1)));
      if (gen !== this.gen) return;
    }
  }
}

interface Subscriber {
  readonly runId: string | undefined;
  afterPosition: number;
  readonly listener: (event: StoredEvent) => void;
}

interface CapabilityEntry {
  readonly capability: string;
  readonly offerId?: string;
  readonly leaseId?: string;
  handler: FrontendHandler;
  unregistered: boolean;
  renewal?: ReturnType<typeof setInterval>;
}

/** Owns the single reconnecting event stream that every derived Readable is built from. */
class Engine {
  readonly status = new SimpleReadable<ConnectionStatus>("connecting");
  private readonly buffer: StoredEvent[] = [];
  private position = 0;
  private closed = false;
  private readonly controller = new AbortController();
  private readonly runStores = new Map<string, RunStore>();
  private readonly threadStores = new Map<string, ThreadSharedStateStore>();
  private readonly projectionStores = new Map<string, ProjectionStore>();
  private readonly subscribers = new Set<Subscriber>();
  private readonly capabilities = new Set<CapabilityEntry>();
  private readonly remoteOfferIds = new Set<string>();
  private readonly resolvedFrontend = new Set<string>();
  private readonly inFlightFrontend = new Set<string>();
  private readonly loopDone: Promise<void>;

  constructor(
    private readonly service: RuntimeService,
    private readonly caller: Caller,
    private readonly reconnect: { readonly baseMs: number; readonly maxMs: number },
  ) {
    this.loopDone = this.loop();
  }

  private async loop(): Promise<void> {
    let attempt = 0;
    while (!this.closed) {
      this.status.set(attempt === 0 ? "connecting" : "reconnecting");
      try {
        const iterable = this.service.events(this.caller, { afterPosition: this.position, follow: true, signal: this.controller.signal });
        this.status.set("live");
        for await (const event of iterable) {
          if (this.closed) break;
          this.position = event.position;
          this.buffer.push(event);
          this.dispatch(event);
        }
        if (this.closed) break;
      } catch {
        if (this.closed) break;
      }
      attempt += 1;
      await sleep(backoffMs(this.reconnect, attempt), this.controller.signal);
    }
    this.status.set("closed");
  }

  close(): void {
    this.closed = true;
    this.controller.abort();
    for (const store of this.threadStores.values()) store.close();
    this.threadStores.clear();
    for (const store of this.projectionStores.values()) store.cancel();
    for (const entry of this.capabilities) {
      entry.unregistered = true;
      if (entry.renewal) clearInterval(entry.renewal);
    }
    this.capabilities.clear();
  }

  async waitClosed(): Promise<void> {
    await this.loopDone;
  }

  async revokeRemoteOffers(): Promise<void> {
    await Promise.allSettled([...this.remoteOfferIds].map((offerId) => this.service.revokeRemoteOffer(this.caller, { offerId })));
    this.remoteOfferIds.clear();
  }

  private dispatch(event: StoredEvent): void {
    for (const sub of this.subscribers) {
      if (sub.runId !== undefined && sub.runId !== event.runId) continue;
      if (event.position <= sub.afterPosition) continue;
      sub.afterPosition = event.position;
      sub.listener(event);
    }
    if (event.runId) {
      const store = this.runStores.get(event.runId);
      if (store) store.apply(event);
    }
    for (const projection of this.projectionStores.values()) projection.scheduleRefresh(event.position);
    if (event.eventType === "run.waiting") void this.scanCapabilities();
  }

  subscribe(options: { readonly afterPosition?: number; readonly runId?: string }, listener: (event: StoredEvent) => void): () => void {
    const afterPosition = options.afterPosition ?? 0;
    const sub: Subscriber = { runId: options.runId, afterPosition, listener };
    for (const event of this.buffer) {
      if (event.position <= sub.afterPosition) continue;
      if (sub.runId !== undefined && sub.runId !== event.runId) continue;
      sub.afterPosition = event.position;
      listener(event);
    }
    this.subscribers.add(sub);
    return () => {
      this.subscribers.delete(sub);
    };
  }

  getRunStore(runId: string): RunStore {
    let store = this.runStores.get(runId);
    if (!store) {
      store = new RunStore(runId, this.service, this.caller);
      for (const event of this.buffer) if (event.runId === runId) store.apply(event);
      this.runStores.set(runId, store);
    }
    return store;
  }

  getThreadStore(threadId: string): ThreadSharedStateStore {
    let store = this.threadStores.get(threadId);
    if (!store) {
      store = new ThreadSharedStateStore(threadId, this.service, this.caller, (listener) => this.subscribe({}, listener));
      this.threadStores.set(threadId, store);
    }
    return store;
  }

  getProjectionStore(name: string): ProjectionStore {
    let store = this.projectionStores.get(name);
    if (!store) {
      // Seed the convergence target with what this client has already observed: a projection read
      // issued now must cover those events, even though no future event will re-trigger it.
      store = new ProjectionStore(name, this.service, this.caller, this.position);
      this.projectionStores.set(name, store);
    }
    return store;
  }

  provideCapability(capability: string, handler: FrontendHandler): () => void {
    const entry: CapabilityEntry = { capability, handler, unregistered: false };
    this.capabilities.add(entry);
    void this.scanCapabilities();
    return () => {
      entry.unregistered = true;
      this.capabilities.delete(entry);
    };
  }

  async offerCapability(offer: RemoteCapabilityOfferInput, handler: FrontendHandler): Promise<() => Promise<void>> {
    const request = {
      leaseId: offer.leaseId,
      agent: offer.agent,
      contract: offer.contract,
      description: offer.description,
      inputSchema: offer.inputSchema,
      ...(offer.outputSchema === undefined ? {} : { outputSchema: offer.outputSchema }),
      ttlMs: offer.ttlMs ?? 30_000,
    };
    const published = await this.service.publishRemoteOffer(this.caller, request);
    const entry: CapabilityEntry = { capability: published.contract.id, offerId: published.id, leaseId: published.leaseId, handler, unregistered: false };
    // Unary transports cannot observe a tab crash. Renewing before expiry makes the lease a
    // bounded liveness claim; clean disposal still revokes immediately.
    entry.renewal = setInterval(() => {
      if (!entry.unregistered) void this.service.publishRemoteOffer(this.caller, request).catch(() => {});
    }, Math.max(1, Math.floor(request.ttlMs / 2)));
    this.capabilities.add(entry);
    this.remoteOfferIds.add(published.id);
    void this.scanCapabilities();
    return async () => {
      entry.unregistered = true;
      if (entry.renewal) clearInterval(entry.renewal);
      this.capabilities.delete(entry);
      this.remoteOfferIds.delete(published.id);
      await this.service.revokeRemoteOffer(this.caller, { offerId: published.id }).catch(() => {});
    };
  }

  private async scanCapabilities(): Promise<void> {
    if (this.capabilities.size === 0) return;
    let list: ContinuationView[];
    try {
      list = await this.service.listContinuations(this.caller, { status: "OPEN" });
    } catch {
      return;
    }
    for (const continuation of list) {
      const condition = continuation.condition as { readonly kind?: string; readonly capability?: string; readonly offerId?: string; readonly leaseId?: string } | null;
      if (!condition || condition.kind !== "frontend_capability") continue;
      if (this.resolvedFrontend.has(continuation.id) || this.inFlightFrontend.has(continuation.id)) continue;
      for (const entry of this.capabilities) {
        if (entry.unregistered || entry.capability !== condition.capability) continue;
        // A lease-bound continuation can only be handled by the exact offering registration.
        // The legacy unscoped handler remains valid only for legacy continuations with no offer id.
        if (condition.offerId !== undefined && (entry.offerId !== condition.offerId || entry.leaseId !== condition.leaseId)) continue;
        if (condition.offerId === undefined && entry.offerId !== undefined) continue;
        this.inFlightFrontend.add(continuation.id);
        void this.executeCapability(entry, continuation);
        break;
      }
    }
  }

  private async executeCapability(entry: CapabilityEntry, continuation: ContinuationView): Promise<void> {
    try {
      const value = await entry.handler(continuation.payload, { runId: continuation.runId, continuationId: continuation.id });
      await this.service.resolveContinuation(this.caller, {
        continuationId: continuation.id,
        action: "resume",
        input: { ok: true, value },
        idempotencyKey: `frontend:${continuation.id}`,
      });
    } catch (error) {
      await this.service
        .resolveContinuation(this.caller, {
          continuationId: continuation.id,
          action: "resume",
          input: { ok: false, error: error instanceof Error ? error.message : String(error) },
          idempotencyKey: `frontend:${continuation.id}`,
        })
        .catch(() => {});
    } finally {
      this.resolvedFrontend.add(continuation.id);
      this.inFlightFrontend.delete(continuation.id);
    }
  }
}

export function createClient(options: ClientOptions): CognateClient {
  const { service, caller } = options;
  const reconnect = options.reconnect ?? { baseMs: 50, maxMs: 2000 };
  const engine = new Engine(service, caller, reconnect);

  return {
    status: engine.status,

    async startRun(agent, input, requestOptions) {
      return service.startRun(caller, {
        agent,
        input,
        idempotencyKey: requestOptions?.idempotencyKey ?? crypto.randomUUID(),
        ...(requestOptions?.correlationId !== undefined ? { correlationId: requestOptions.correlationId } : {}),
        ...(requestOptions?.state !== undefined ? { state: requestOptions.state } : {}),
      });
    },

    async cancelRun(runId, reason) {
      return service.cancelRun(caller, { runId, reason, idempotencyKey: crypto.randomUUID() });
    },

    async updateState(runId, update, updateOptions) {
      return service.updateState(caller, {
        runId,
        update,
        idempotencyKey: updateOptions?.idempotencyKey ?? crypto.randomUUID(),
        ...(updateOptions?.expectedVersion !== undefined ? { expectedVersion: updateOptions.expectedVersion } : {}),
      });
    },

    threadSharedState(threadId) {
      return engine.getThreadStore(threadId);
    },

    async updateThreadSharedState(threadId, update, updateOptions) {
      const result = await service.updateSharedState(caller, {
        threadId,
        update,
        idempotencyKey: updateOptions?.idempotencyKey ?? crypto.randomUUID(),
        ...(updateOptions?.expectedVersion !== undefined ? { expectedVersion: updateOptions.expectedVersion } : {}),
      });
      engine.getThreadStore(threadId).accept(result);
      return result;
    },

    run(runId) {
      return engine.getRunStore(runId);
    },

    subscribe(subscribeOptions, listener) {
      return engine.subscribe(subscribeOptions, listener);
    },

    projection(name) {
      return engine.getProjectionStore(name);
    },
    async resolveContinuation(continuationId, action, input, resolveOptions) {
      const result = await service.resolveContinuation(caller, {
        continuationId,
        action,
        ...(input !== undefined ? { input } : {}),
        idempotencyKey: crypto.randomUUID(),
        ...(resolveOptions?.expectedVersion !== undefined ? { expectedVersion: resolveOptions.expectedVersion } : {}),
        ...(resolveOptions?.reason !== undefined ? { reason: resolveOptions.reason } : {}),
      });
      return result.continuation;
    },

    provideCapability(capability, handler) {
      return engine.provideCapability(capability, handler);
    },

    async offerCapability(offer, handler) {
      return engine.offerCapability(offer, handler);
    },

    async invoke(capability, input) {
      return service.invoke(caller, { capability, input, idempotencyKey: crypto.randomUUID() });
    },

    async artifact(artifactId, representation) {
      const record = await service.getArtifact(caller, { artifactId, ...(representation !== undefined ? { representation } : {}) });
      return { name: record.name, mediaType: record.mediaType, bytes: record.bytes };
    },

    async close() {
      engine.close();
      await engine.waitClosed();
      await engine.revokeRemoteOffers();
    },
  };
}
