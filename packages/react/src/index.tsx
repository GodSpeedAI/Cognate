// React 19 bindings over the headless client (spec §25.2). All hooks are thin useSyncExternalStore
// adapters over the client's framework-neutral Readables; the client remains the single source of truth.
import type { CognateClient, ConnectionStatus, FrontendHandler, RemoteCapabilityOfferInput, RunState, ThreadSharedState } from "@godspeedai/client";
import type { Json, StoredEvent } from "@godspeedai/events";
import type { ContinuationView, RunView, StateUpdate } from "@godspeedai/runtime-api";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const CognateContext = createContext<CognateClient | undefined>(undefined);

export interface RemoteCapabilityRenderRecord {
  /** The durable continuation that selected this exact browser handler. */
  readonly continuationId: string;
  readonly runId: string;
  readonly capability: string;
  readonly contractVersion: string;
  readonly input: Json;
  readonly status: "pending" | "completed" | "failed";
  readonly result: Json | undefined;
  readonly error: string | undefined;
  /** Positions observed from the durable run stream, when the history hook is mounted. */
  readonly durable: { readonly waitingPosition?: number; readonly terminalPosition?: number };
}

export type RemoteCapabilityRenderer = (record: RemoteCapabilityRenderRecord) => ReactNode;

interface RendererEntry extends RemoteCapabilityRenderRecord {
  readonly renderer: RemoteCapabilityRenderer;
}

interface DurableEvidence {
  readonly runId: string;
  readonly waitingPosition?: number;
  readonly terminalPosition?: number;
}

class RemoteCapabilityRendererRegistry {
  private readonly entries = new Map<string, RendererEntry>();
  private readonly keysByContinuation = new Map<string, string>();
  private readonly evidence = new Map<string, DurableEvidence>();
  private readonly listeners = new Set<() => void>();
  private readonly snapshots = new Map<string, readonly RendererEntry[]>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  history(runId: string | undefined): readonly RendererEntry[] {
    if (runId === undefined) return EMPTY_REMOTE_RENDER_HISTORY;
    const cached = this.snapshots.get(runId);
    if (cached) return cached;
    const history = [...this.entries.values()]
      .filter((entry) => entry.runId === runId)
      .sort((a, b) => a.continuationId.localeCompare(b.continuationId));
    this.snapshots.set(runId, history);
    return history;
  }

  bind(context: { readonly continuationId: string; readonly runId: string }, contract: { readonly id: string; readonly version: string }, input: Json, renderer: RemoteCapabilityRenderer): string {
    // The continuation id comes from the durable wait selected by the runtime. Including the
    // contract version prevents a remounted offer from being mistaken for an older call.
    const key = `${context.continuationId}@${contract.version}`;
    const durable = this.evidence.get(context.continuationId);
    this.entries.set(key, {
      continuationId: context.continuationId,
      runId: context.runId,
      capability: contract.id,
      contractVersion: contract.version,
      input,
      status: "pending",
      result: undefined,
      error: undefined,
      durable: durable ?? { runId: context.runId },
      renderer,
    });
    this.keysByContinuation.set(context.continuationId, key);
    this.publish();
    return key;
  }

  complete(key: string, result: Json): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.set(key, { ...entry, status: "completed", result, error: undefined });
    this.publish();
  }

  fail(key: string, error: unknown): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.set(key, { ...entry, status: "failed", error: error instanceof Error ? error.message : String(error) });
    this.publish();
  }

  observe(event: StoredEvent): void {
    if (!event.runId) return;
    if (event.eventType === "run.waiting") {
      const type = field<string>(event.payload, "type");
      const continuationId = field<string>(event.metadata, "continuationId");
      if (!continuationId || !type?.startsWith("remote:")) return;
      this.evidence.set(continuationId, { runId: event.runId, waitingPosition: event.position });
      this.updateDurable(continuationId);
      return;
    }
    if (event.eventType === "run.completed" || event.eventType === "run.failed" || event.eventType === "run.cancelled") {
      for (const [continuationId, evidence] of this.evidence) {
        if (evidence.runId !== event.runId) continue;
        this.evidence.set(continuationId, { ...evidence, terminalPosition: event.position });
        this.updateDurable(continuationId);
      }
    }
  }

  private updateDurable(continuationId: string): void {
    const key = this.keysByContinuation.get(continuationId);
    const entry = key ? this.entries.get(key) : undefined;
    const durable = this.evidence.get(continuationId);
    if (!entry || !durable) return;
    this.entries.set(key!, { ...entry, durable });
    this.publish();
  }

  private publish(): void {
    this.snapshots.clear();
    for (const listener of this.listeners) listener();
  }
}

const EMPTY_REMOTE_RENDER_HISTORY: readonly RendererEntry[] = [];
const RemoteCapabilityRendererContext = createContext<RemoteCapabilityRendererRegistry | undefined>(undefined);

function field<T>(value: Json | undefined, key: string): T | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) && key in value ? (value[key] as T) : undefined;
}

function RemoteCapabilityRendererProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const registryRef = useRef<RemoteCapabilityRendererRegistry | undefined>(undefined);
  if (!registryRef.current) registryRef.current = new RemoteCapabilityRendererRegistry();
  return <RemoteCapabilityRendererContext.Provider value={registryRef.current}>{children}</RemoteCapabilityRendererContext.Provider>;
}

function useRemoteCapabilityRendererRegistry(): RemoteCapabilityRendererRegistry {
  const registry = useContext(RemoteCapabilityRendererContext);
  if (!registry) throw new Error("useRemoteCapability renderer registry requires CognateProvider");
  return registry;
}

export function CognateProvider({ client, children }: { readonly client: CognateClient; readonly children: ReactNode }): ReactNode {
  return <CognateContext.Provider value={client}><RemoteCapabilityRendererProvider>{children}</RemoteCapabilityRendererProvider></CognateContext.Provider>;
}

/** The client from the nearest provider. */
export function useCognate(): CognateClient {
  const client = useContext(CognateContext);
  if (!client) throw new Error("useCognate: no CognateProvider found in the component tree");
  return client;
}

/** Live derived state of a run (undefined id → undefined). Uses useSyncExternalStore over the client's Readable. */
export function useRun(runId: string | undefined): RunState | undefined {
  const client = useCognate();
  const store = useMemo(() => (runId === undefined ? undefined : client.run(runId)), [client, runId]);
  const subscribe = useCallback((onStoreChange: () => void) => (store ? store.subscribe(onStoreChange) : () => {}), [store]);
  const getSnapshot = useCallback(() => store?.get(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Start runs of one agent and follow the latest. */
export function useAgent(agent: string): { readonly start: (input: Json) => Promise<RunView>; readonly runId: string | undefined; readonly state: RunState | undefined } {
  const client = useCognate();
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const start = useCallback(
    async (input: Json) => {
      const view = await client.startRun(agent, input);
      setRunId(view.runId);
      return view;
    },
    [client, agent],
  );
  const state = useRun(runId);
  return { start, runId, state };
}

/**
 * The run's live shared state (spec §29.1), and a writer that appends a caller-sourced `state.changed` event
 * the agent observes through `RunContext.state`. `state` follows `useRun`'s derived value; `update` resolves
 * once the write is durable.
 */
export function useSharedState(runId: string | undefined): { readonly state: Json; readonly update: (update: StateUpdate, options?: { readonly expectedVersion?: number }) => Promise<{ readonly state: Json; readonly version: number }> } {
  const client = useCognate();
  const run = useRun(runId);
  const update = useCallback(
    (stateUpdate: StateUpdate, options?: { readonly expectedVersion?: number }) => {
      if (runId === undefined) throw new Error("useSharedState: no run id");
      return client.updateState(runId, stateUpdate, options);
    },
    [client, runId],
  );
  return { state: run?.state ?? null, update };
}

/** Live state shared by all runs in a thread, with a caller update function. */
export function useThreadSharedState(threadId: string): ThreadSharedState & {
  readonly update: (update: StateUpdate, options?: { readonly expectedVersion?: number }) => Promise<{ readonly state: Json; readonly version: number }>;
} {
  const client = useCognate();
  const store = useMemo(() => client.threadSharedState(threadId), [client, threadId]);
  const subscribe = useCallback((onStoreChange: () => void) => store.subscribe(onStoreChange), [store]);
  const getSnapshot = useCallback(() => store.get(), [store]);
  const shared = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const update = useCallback(
    (stateUpdate: StateUpdate, options?: { readonly expectedVersion?: number }) => client.updateThreadSharedState(threadId, stateUpdate, options),
    [client, threadId],
  );
  return { ...shared, update };
}

export function useProjection(name: string): readonly { readonly key: string; readonly value: Json }[] | undefined {
  const client = useCognate();
  const store = useMemo(() => client.projection(name), [client, name]);
  const subscribe = useCallback((onStoreChange: () => void) => store.subscribe(onStoreChange), [store]);
  const getSnapshot = useCallback(() => store.get(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Provide a frontend capability while the component is mounted; unregistered on unmount (a reversible effect). */
export function useCapability(capability: string, handler: FrontendHandler): void {
  const client = useCognate();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  useEffect(() => {
    return client.provideCapability(capability, (input, context) => handlerRef.current(input, context));
  }, [client, capability]);
}

/** Publish a descriptor-backed remote capability for the mounted component lifetime. */
export function useRemoteCapability(offer: Omit<RemoteCapabilityOfferInput, "leaseId">, handler: FrontendHandler, options?: { readonly render?: RemoteCapabilityRenderer }): { readonly status: "publishing" | "available" | "error"; readonly error: Error | null } {
  const client = useCognate();
  const renderers = useRemoteCapabilityRendererRegistry();
  const handlerRef = useRef(handler);
  const rendererRef = useRef(options?.render);
  const leaseRef = useRef<string>(crypto.randomUUID());
  const offerKey = JSON.stringify(offer);
  const [status, setStatus] = useState<"publishing" | "available" | "error">("publishing");
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  useEffect(() => {
    rendererRef.current = options?.render;
  }, [options?.render]);
  useEffect(() => {
    let disposed = false;
    let unregister: (() => Promise<void>) | undefined;
    setStatus("publishing");
    setError(null);
    void client.offerCapability({ ...offer, leaseId: leaseRef.current }, async (input, context) => {
      const renderer = rendererRef.current;
      const key = renderer ? renderers.bind(context, offer.contract, input, renderer) : undefined;
      try {
        const result = await handlerRef.current(input, context);
        if (key) renderers.complete(key, result);
        return result;
      } catch (error) {
        if (key) renderers.fail(key, error);
        throw error;
      }
    }).then((stop) => {
      if (disposed) void stop();
      else {
        unregister = stop;
        setStatus("available");
      }
    }).catch((cause: unknown) => {
      if (!disposed) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setStatus("error");
      }
    });
    return () => {
      disposed = true;
      if (unregister) void unregister();
    };
  }, [client, offerKey, renderers]);
  return { status, error };
}

/**
 * Same-session renderer provenance for completed or pending remote calls in a run. The hook
 * derives wait/terminal positions from durable events, while the renderer callback itself stays
 * in the mounted CognateProvider's memory and therefore cannot be restored after a full reload.
 */
export function useRemoteCapabilityHistory(runId: string | undefined): readonly (RemoteCapabilityRenderRecord & { readonly render: RemoteCapabilityRenderer })[] {
  const client = useCognate();
  const registry = useRemoteCapabilityRendererRegistry();
  useEffect(() => {
    if (runId === undefined) return;
    return client.subscribe({ runId, afterPosition: 0 }, (event) => registry.observe(event));
  }, [client, registry, runId]);
  const subscribe = useCallback((listener: () => void) => registry.subscribe(listener), [registry]);
  const snapshot = useCallback(() => registry.history(runId), [registry, runId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot).map(({ renderer, ...record }) => ({ ...record, render: renderer }));
}

/** Open continuations of a run plus a resolver. */
export function useContinuations(runId: string | undefined): { readonly open: readonly ContinuationView[]; readonly resolve: (id: string, action: "resume" | "cancel", input?: Json) => Promise<void> } {
  const client = useCognate();
  const state = useRun(runId);
  const resolve = useCallback(
    async (id: string, action: "resume" | "cancel", input?: Json) => {
      await client.resolveContinuation(id, action, input);
    },
    [client],
  );
  return { open: state?.openContinuations ?? [], resolve };
}

export function useArtifact(artifactId: string | undefined): { readonly status: "idle" | "loading" | "ready" | "error"; readonly name?: string; readonly mediaType?: string; readonly text?: string; readonly error?: string } {
  const client = useCognate();
  type Result = { readonly status: "idle" | "loading" | "ready" | "error"; readonly name?: string; readonly mediaType?: string; readonly text?: string; readonly error?: string };
  const [result, setResult] = useState<Result>({ status: "idle" });

  useEffect(() => {
    if (artifactId === undefined) {
      setResult({ status: "idle" });
      return;
    }
    let cancelled = false;
    setResult({ status: "loading" });
    client
      .artifact(artifactId)
      .then((record) => {
        if (cancelled) return;
        if (record.mediaType.startsWith("text/")) {
          setResult({ status: "ready", name: record.name, mediaType: record.mediaType, text: new TextDecoder().decode(record.bytes) });
        } else {
          setResult({ status: "ready", name: record.name, mediaType: record.mediaType });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult({ status: "error", error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [client, artifactId]);

  return result;
}

export function useConnectionStatus(): ConnectionStatus {
  const client = useCognate();
  const subscribe = useCallback((onStoreChange: () => void) => client.status.subscribe(onStoreChange), [client]);
  const getSnapshot = useCallback(() => client.status.get(), [client]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
