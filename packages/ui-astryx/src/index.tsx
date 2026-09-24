import type { ContinuationView } from "@cognate/runtime-api";
import type { ReactNode } from "react";

export type ThemeMode = "light" | "dark";

/** Application shell: Astryx Theme (neutral), header with title and theme toggle, main content region. */
export function CognateShell(_props: { readonly title: string; readonly mode?: ThemeMode; readonly onModeChange?: (mode: ThemeMode) => void; readonly children: ReactNode }): ReactNode {
  throw new Error("ui-astryx: not implemented");
}

/** Chat surface for one agent: message input that starts runs; streamed assistant text of the latest run. */
export function ChatPanel(_props: { readonly agent: string; readonly placeholder?: string; readonly onRunStarted?: (runId: string) => void }): ReactNode {
  throw new Error("ui-astryx: not implemented");
}

/** Approval surface for one continuation: shows type and payload; approve/reject resolve it. */
export function ApprovalCard(_props: { readonly continuation: ContinuationView; readonly onResolve: (approved: boolean) => void | Promise<void> }): ReactNode {
  throw new Error("ui-astryx: not implemented");
}

/** All open approval-style continuations of a run, each as an ApprovalCard resolving through the client. */
export function Approvals(_props: { readonly runId: string | undefined }): ReactNode {
  throw new Error("ui-astryx: not implemented");
}

/** Artifact viewer: text/markdown as text, application/json as a key/value table, other media as a download link. */
export function ArtifactViewer(_props: { readonly artifactId: string | undefined }): ReactNode {
  throw new Error("ui-astryx: not implemented");
}

/** Run inspection: status, error, and the run's open continuations and artifacts. */
export function RunInspector(_props: { readonly runId: string | undefined }): ReactNode {
  throw new Error("ui-astryx: not implemented");
}

/** Shared state inspection: the run's derived state as formatted JSON. */
export function StateInspector(_props: { readonly runId: string | undefined }): ReactNode {
  throw new Error("ui-astryx: not implemented");
}
