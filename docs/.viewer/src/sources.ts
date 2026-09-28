/**
 * Artifact sources and the wire client.
 *
 * A source answers one question: where did this artifact state come from? Nothing downstream
 * knows or cares — the working tree and an old revision produce the same Artifact, and the
 * difference travels as provenance. Adding a source means adding a case here, not changing a
 * renderer.
 */
import type { CompareResponse, DocumentResponse, ErrorResponse, HealthResponse, HistoryResponse, IndexResponse, Provenance, SaveResponse } from "./wire.ts";

export class ViewerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ViewerError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new ViewerError("offline", "The viewer server is not responding.", error instanceof Error ? error.message : String(error));
  }
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text === "" ? null : JSON.parse(text);
  } catch {
    throw new ViewerError("internal", `The viewer returned unreadable data (HTTP ${response.status}).`, text.slice(0, 300));
  }
  if (!response.ok) {
    const failure = (payload as ErrorResponse | null)?.error;
    throw new ViewerError(failure?.code ?? "internal", failure?.message ?? `Request failed (HTTP ${response.status}).`, failure?.detail);
  }
  return payload as T;
}

export const api = {
  index: (): Promise<IndexResponse> => request<IndexResponse>("/api/index"),
  health: (): Promise<HealthResponse> => request<HealthResponse>("/api/health"),
  document: (path: string, ref?: string | null): Promise<DocumentResponse> =>
    request<DocumentResponse>(`/api/document?path=${encodeURIComponent(path)}${ref ? `&rev=${encodeURIComponent(ref)}` : ""}`),
  history: (path: string, limit = 400): Promise<HistoryResponse> => request<HistoryResponse>(`/api/history?path=${encodeURIComponent(path)}&limit=${limit}`),
  compare: (path: string, from: string, to: string): Promise<CompareResponse> =>
    request<CompareResponse>(`/api/compare?path=${encodeURIComponent(path)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  save: (input: { path: string; content: string; expectedSha256?: string }): Promise<SaveResponse> =>
    request<SaveResponse>("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  /** An image or other referenced artifact, always resolved inside the documentation root. */
  assetUrl: (repoPath: string): string => `/api/asset?path=${encodeURIComponent(repoPath)}`,
};

export interface ArtifactSource {
  readonly kind: "working-tree" | "revision";
  /** Stable identity used for the URL and for scroll memory. */
  readonly id: string;
  load(path: string): Promise<DocumentResponse>;
}

export const workingTreeSource: ArtifactSource = {
  kind: "working-tree",
  id: "working",
  load: (path) => api.document(path, null),
};

export function revisionSource(rev: string): ArtifactSource {
  return { kind: "revision", id: rev, load: (path) => api.document(path, rev) };
}

/** `null` means the working tree; anything else is a revision reference. */
export function sourceFor(rev: string | null): ArtifactSource {
  return rev === null ? workingTreeSource : revisionSource(rev);
}

/** How a source reads in the interface: never "the document", always "the document *from* …". */
export function sourceLabel(provenance: Provenance): string {
  return provenance.source === "revision" ? `Revision ${provenance.revision?.shortHash ?? ""}`.trim() : "Working tree";
}

export function workingTreeStateLabel(provenance: Provenance): { text: string; tone: string } {
  const state = provenance.workingTree;
  if (!state.available) return { text: "history unavailable", tone: "chip--untracked" };
  switch (state.state) {
    case "clean":
      return { text: "committed", tone: "chip--clean chip--dot" };
    case "modified":
      return { text: "modified", tone: "chip--modified chip--dot" };
    case "staged":
      return { text: "staged", tone: "chip--staged chip--dot" };
    case "untracked":
      return { text: "untracked", tone: "chip--untracked chip--dot" };
    case "deleted":
      return { text: "deleted", tone: "chip--modified chip--dot" };
    case "renamed":
      return { text: "renamed", tone: "chip--modified chip--dot" };
    default:
      return { text: "status unknown", tone: "chip--untracked" };
  }
}
