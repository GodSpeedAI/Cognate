// CG-CLT-001 (spec §25.1, §31.8): headless client over the runtime service; reconnect from cursor; frontend capabilities.
// All exposed state is DERIVED from durable events -- nothing here is authoritative, everything can be rebuilt
// by replaying the tenant's event stream from position 0. No React import (framework-neutral).
import type { Json, StoredEvent } from "@cognate/events";
import type { Caller, ContinuationView, RunView, RuntimeService } from "@cognate/runtime-api";

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
  /** Concatenated `message.delta` text in stream order. */
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

export interface ClientOptions {
  readonly service: RuntimeService;
  readonly caller: Caller;
  /** Reconnect backoff for event streams (default 50 ms doubling to 2 s). */
  readonly reconnect?: { readonly baseMs: number; readonly maxMs: number };
}

export type FrontendHandler = (input: Json, context: { readonly runId: string; readonly continuationId: string }) => Json | Promise<Json>;

export interface CognateClient {
  readonly status: Readable<ConnectionStatus>;
  startRun(agent: string, input: Json, options?: { readonly idempotencyKey?: string; readonly correlationId?: string }): Promise<RunView>;
  cancelRun(runId: string, reason: string): Promise<RunView>;
  /** Live, reconnecting, derived state of one run. */
  run(runId: string): Readable<RunState>;
  /** Subscribe to tenant events from a position with automatic resume after disconnect; no gaps, no duplicates. */
  subscribe(options: { readonly afterPosition?: number; readonly runId?: string }, listener: (event: StoredEvent) => void): () => void;
  /** A public projection, refreshed when events commit. */
  projection(name: string): Readable<readonly { readonly key: string; readonly value: Json }[] | undefined>;
  resolveContinuation(continuationId: string, action: "resume" | "cancel", input?: Json, options?: { readonly expectedVersion?: number; readonly reason?: string }): Promise<ContinuationView>;
  /**
   * Serve a frontend capability: open `frontend_capability` continuations naming it are executed locally and
   * resolved with `{ ok, value | error }`. Returns an unregister function.
   */
  provideCapability(capability: string, handler: FrontendHandler): () => void;
  /** Perform a semantic action through the runtime's authorized capability path. */
  invoke(capability: string, input: Json): Promise<Json>;
  artifact(artifactId: string, representation?: string): Promise<{ readonly name: string; readonly mediaType: string; readonly bytes: Uint8Array }>;
  close(): Promise<void>;
}

// ── JSON Patch (RFC 6902): add, remove, replace, move, copy, test ──────────────────

type JsonPatchOp =
  | { readonly op: "add"; readonly path: string; readonly value: Json }
  | { readonly op: "remove"; readonly path: string }
  | { readonly op: "replace"; readonly path: string; readonly value: Json }
  | { readonly op: "move"; readonly from: string; readonly path: string }
  | { readonly op: "copy"; readonly from: string; readonly path: string }
  | { readonly op: "test"; readonly path: string; readonly value: Json };

function parsePointer(pointer: string): readonly string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`invalid JSON pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function cloneJson(value: Json): Json {
  return value === null ? null : (JSON.parse(JSON.stringify(value)) as Json);
}

function getIn(doc: Json, path: readonly string[]): Json {
  let cursor: Json = doc;
  for (const segment of path) {
    if (Array.isArray(cursor)) cursor = cursor[segment === "-" ? cursor.length - 1 : Number(segment)] ?? null;
    else if (cursor && typeof cursor === "object") cursor = (cursor as { [key: string]: Json })[segment] ?? null;
    else return null;
  }
  return cursor;
}

function setIn(doc: Json, path: readonly string[], value: Json, mode: "add" | "replace" | "remove"): Json {
  if (path.length === 0) return mode === "remove" ? null : value;
  const result = cloneJson(doc);
  // biome-ignore-start: mutation is local to the freshly cloned tree
  let cursor: Json = result;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    if (Array.isArray(cursor)) cursor = cursor[segment === "-" ? cursor.length - 1 : Number(segment)]!;
    else if (cursor && typeof cursor === "object") cursor = (cursor as { [key: string]: Json })[segment]!;
  }
  const last = path[path.length - 1]!;
  if (Array.isArray(cursor)) {
    const index = last === "-" ? cursor.length : Number(last);
    if (mode === "remove") cursor.splice(index, 1);
    else if (mode === "add") cursor.splice(index, 0, value);
    else cursor[index] = value;
  } else if (cursor && typeof cursor === "object") {
    const record = cursor as { [key: string]: Json };
    if (mode === "remove") delete record[last];
    else record[last] = value;
  }
  // biome-ignore-end
  return result;
}

function applyJsonPatch(doc: Json, ops: readonly JsonPatchOp[]): Json {
  let result = doc;
  for (const op of ops) {
    switch (op.op) {
      case "add":
        result = setIn(result, parsePointer(op.path), op.value, "add");
        break;
      case "replace":
        result = setIn(result, parsePointer(op.path), op.value, "replace");
        break;
      case "remove":
        result = setIn(result, parsePointer(op.path), null, "remove");
        break;
      case "move": {
        const value = getIn(result, parsePointer(op.from));
        result = setIn(result, parsePointer(op.from), null, "remove");
        result = setIn(result, parsePointer(op.path), value, "add");
        break;
      }
      case "copy": {
        const value = getIn(result, parsePointer(op.from));
        result = setIn(result, parsePointer(op.path), cloneJson(value), "add");
        break;
      }
      case "test": {
        const value = getIn(result, parsePointer(op.path));
        if (JSON.stringify(value) !== JSON.stringify(op.value)) throw new Error(`JSON Patch test failed at ${op.path}`);
        break;
      }
    }
  }
  return result;
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
      case "state.changed": {
        const snapshot = payloadField<Json>(event, "snapshot");
        if (snapshot !== undefined) this.stateJson = snapshot;
        else {
          const patch = payloadField<readonly JsonPatchOp[]>(event, "patch");
          if (patch) this.stateJson = applyJsonPatch(this.stateJson, patch);
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

class ProjectionStore implements Readable<readonly { readonly key: string; readonly value: Json }[] | undefined> {
  private readonly listeners = new Set<(value: readonly { readonly key: string; readonly value: Json }[] | undefined) => void>();
  private value: readonly { readonly key: string; readonly value: Json }[] | undefined;
  private gen = 0;

  constructor(
    private readonly name: string,
    private readonly service: RuntimeService,
    private readonly caller: Caller,
  ) {
    this.scheduleRefresh();
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

  scheduleRefresh(): void {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const gen = ++this.gen;
    let value: readonly { readonly key: string; readonly value: Json }[];
    try {
      value = await this.service.readProjection(this.caller, { name: this.name });
    } catch {
      return;
    }
    if (gen !== this.gen) return;
    this.value = value;
    for (const listener of this.listeners) listener(this.value);
  }
}

interface Subscriber {
  readonly runId: string | undefined;
  afterPosition: number;
  readonly listener: (event: StoredEvent) => void;
}

interface CapabilityEntry {
  readonly capability: string;
  handler: FrontendHandler;
  unregistered: boolean;
}

/** Owns the single reconnecting event stream that every derived Readable is built from. */
class Engine {
  readonly status = new SimpleReadable<ConnectionStatus>("connecting");
  private readonly buffer: StoredEvent[] = [];
  private position = 0;
  private closed = false;
  private readonly controller = new AbortController();
  private readonly runStores = new Map<string, RunStore>();
  private readonly projectionStores = new Map<string, ProjectionStore>();
  private readonly subscribers = new Set<Subscriber>();
  private readonly capabilities = new Set<CapabilityEntry>();
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
  }

  async waitClosed(): Promise<void> {
    await this.loopDone;
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
    for (const projection of this.projectionStores.values()) projection.scheduleRefresh();
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

  getProjectionStore(name: string): ProjectionStore {
    let store = this.projectionStores.get(name);
    if (!store) {
      store = new ProjectionStore(name, this.service, this.caller);
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

  private async scanCapabilities(): Promise<void> {
    if (this.capabilities.size === 0) return;
    let list: ContinuationView[];
    try {
      list = await this.service.listContinuations(this.caller, { status: "OPEN" });
    } catch {
      return;
    }
    for (const continuation of list) {
      const condition = continuation.condition as { readonly kind?: string; readonly capability?: string } | null;
      if (!condition || condition.kind !== "frontend_capability") continue;
      if (this.resolvedFrontend.has(continuation.id) || this.inFlightFrontend.has(continuation.id)) continue;
      for (const entry of this.capabilities) {
        if (entry.unregistered || entry.capability !== condition.capability) continue;
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
      });
    },

    async cancelRun(runId, reason) {
      return service.cancelRun(caller, { runId, reason, idempotencyKey: crypto.randomUUID() });
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
    },
  };
}
