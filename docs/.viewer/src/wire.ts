/**
 * The Artifact Viewer wire contract.
 *
 * This file is the single definition of what travels between the local projection
 * server (`scripts/show-documents.ts`) and the browser application. It exists so the
 * invariant cannot drift between its two ends:
 *
 *   ArtifactSource  ->  which state did this come from? (working tree | Git revision)
 *   Artifact        ->  what is it?               (markdown | mermaid | code | table | image | diff)
 *   Provenance      ->  time/version facts displayed *around* the artifact
 *   Projection      ->  how is it presented?      (read | source | edit | history | compare | fullscreen)
 *
 * A Markdown file retrieved from an old commit is still Markdown: the source changes the
 * provenance, never the artifact type or the renderer.
 */

/** Where an artifact's state came from. */
export type ArtifactSource = "working-tree" | "revision";

/** What an artifact is. Documentation Mode produces `markdown`; the rest are its child artifacts. */
export type ArtifactType = "markdown" | "mermaid" | "code" | "table" | "image" | "diff";

/** How an artifact is presented. */
export type Projection = "read" | "source" | "edit" | "history" | "compare" | "fullscreen";

export const PROJECTIONS: readonly Projection[] = ["read", "source", "edit", "history", "compare"];

/** A revision of a document that exists in Git history. */
export interface RevisionRef {
  hash: string;
  shortHash: string;
  /** ISO-8601 author date. */
  date: string;
  author: string;
  email: string;
  subject: string;
  /** Path this file had *at this revision*; differs from the current path when the file was renamed. */
  pathAtRevision: string;
}

/** Working-tree facts for one document. Never invented: `null` means Git did not report it. */
export interface WorkingTreeState {
  /** Whether Git is usable in this repository at all. */
  available: boolean;
  /** Why history is unavailable, when it is. */
  reason?: string;
  tracked: boolean;
  /** Porcelain status reduced to the states the interface can act on. */
  state: "clean" | "modified" | "staged" | "untracked" | "deleted" | "renamed" | "unknown";
  /** Raw `git status --porcelain` line, or null when the path is clean/absent. */
  porcelain: string | null;
  /** Last commit that touched this path, or null when the path has no history yet. */
  lastCommit: RevisionRef | null;
  /** Repository HEAD, or null when the repository has no commits. */
  head: RevisionRef | null;
}

/** Everything the interface displays *around* an artifact. Provenance never changes artifact semantics. */
export interface Provenance {
  source: ArtifactSource;
  /** Repository-relative path. */
  path: string;
  /** Revision facts, present only when `source === "revision"`. */
  revision?: RevisionRef;
  /** Historical revisions are always read-only. */
  readOnly: boolean;
  workingTree: WorkingTreeState;
}

/** The artifact state itself. */
export interface Artifact {
  type: ArtifactType;
  path: string;
  /** Canonical native source. Markdown stays Markdown; Mermaid stays Mermaid inside Markdown. */
  content: string;
}

export interface DocumentResponse {
  artifact: Artifact;
  provenance: Provenance;
  /** Hash of the artifact content as served; the editor sends it back so a save cannot overwrite concurrent disk changes. */
  sha256: string;
}

export interface HistoryResponse {
  path: string;
  /** `true` when Git was asked to follow renames. */
  follow: boolean;
  available: boolean;
  reason?: string;
  entries: RevisionRef[];
}

/** One side of a comparison: a label for the UI plus the state it resolves to. */
export interface CompareSide {
  /** `HEAD`, `working`, or a full commit hash. */
  ref: string;
  label: string;
  content: string;
  provenance: Provenance;
}

export interface CompareResponse {
  path: string;
  from: CompareSide;
  to: CompareSide;
}

export interface SaveResponse {
  path: string;
  sha256: string;
  bytes: number;
  mtimeMs: number;
  workingTree: WorkingTreeState;
}

/** One document in the startup index. Built once when the server starts; never persisted. */
export interface IndexEntry {
  path: string;
  title: string;
  /** Layered heading titles, ordered as they appear. */
  headings: string[];
  /** Parsed YAML frontmatter, or null when the document has none. */
  frontmatter: Record<string, unknown> | null;
  /** Frontmatter that failed to parse, reported instead of silently dropped. */
  frontmatterError?: string;
  /** Searchable plain text derived from the Markdown. */
  text: string;
  /** Raw language tags of fenced code blocks, so code artifacts are discoverable. */
  languages: string[];
  /** Repository-relative targets this document links to. */
  links: string[];
  /** Repository-relative targets outside the documentation root, kept for honesty. */
  externalTargets: string[];
  diagramCount: number;
  tableCount: number;
  bytes: number;
  mtimeMs: number;
}

export interface IndexResponse {
  root: string;
  generatedAt: string;
  docs: IndexEntry[];
  /** For each document, the documents that link to it. */
  backlinks: Record<string, string[]>;
}

export interface HealthResponse {
  ok: true;
  root: string;
  documents: number;
  git: { available: boolean; reason?: string; version: string | null };
}

export type ViewerErrorCode =
  | "outside_root"
  | "invalid_path"
  | "not_found"
  | "not_a_document"
  | "conflict"
  | "read_only"
  | "git_unavailable"
  | "internal";

export interface ErrorResponse {
  error: { code: ViewerErrorCode; message: string; detail?: string };
}
