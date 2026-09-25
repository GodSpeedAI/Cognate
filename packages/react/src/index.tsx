// React 19 bindings over the headless client (spec §25.2). All hooks are thin useSyncExternalStore
// adapters over the client's framework-neutral Readables; the client remains the single source of truth.
import type { CognateClient, ConnectionStatus, FrontendHandler, RunState } from "@cognate/client";
import type { Json } from "@cognate/events";
import type { ContinuationView, RunView, StateUpdate } from "@cognate/runtime-api";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

const CognateContext = createContext<CognateClient | undefined>(undefined);

export function CognateProvider({ client, children }: { readonly client: CognateClient; readonly children: ReactNode }): ReactNode {
  return <CognateContext.Provider value={client}>{children}</CognateContext.Provider>;
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
