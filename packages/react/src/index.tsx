import type { CognateClient, ConnectionStatus, FrontendHandler, RunState } from "@cognate/client";
import type { Json } from "@cognate/events";
import type { ContinuationView, RunView } from "@cognate/runtime-api";
import type { ReactNode } from "react";

export function CognateProvider(_props: { readonly client: CognateClient; readonly children: ReactNode }): ReactNode {
  throw new Error("react: not implemented");
}

/** The client from the nearest provider. */
export function useCognate(): CognateClient {
  throw new Error("react: not implemented");
}

/** Live derived state of a run (undefined id → undefined). Uses useSyncExternalStore over the client's Readable. */
export function useRun(_runId: string | undefined): RunState | undefined {
  throw new Error("react: not implemented");
}

/** Start runs of one agent and follow the latest. */
export function useAgent(_agent: string): { readonly start: (input: Json) => Promise<RunView>; readonly runId: string | undefined; readonly state: RunState | undefined } {
  throw new Error("react: not implemented");
}

export function useProjection(_name: string): readonly { readonly key: string; readonly value: Json }[] | undefined {
  throw new Error("react: not implemented");
}

/** Provide a frontend capability while the component is mounted; unregistered on unmount (a reversible effect). */
export function useCapability(_capability: string, _handler: FrontendHandler): void {
  throw new Error("react: not implemented");
}

/** Open continuations of a run plus a resolver. */
export function useContinuations(_runId: string | undefined): { readonly open: readonly ContinuationView[]; readonly resolve: (id: string, action: "resume" | "cancel", input?: Json) => Promise<void> } {
  throw new Error("react: not implemented");
}

export function useArtifact(_artifactId: string | undefined): { readonly status: "idle" | "loading" | "ready" | "error"; readonly name?: string; readonly mediaType?: string; readonly text?: string; readonly error?: string } {
  throw new Error("react: not implemented");
}

export function useConnectionStatus(): ConnectionStatus {
  throw new Error("react: not implemented");
}
