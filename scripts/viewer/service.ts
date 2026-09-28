/**
 * The bounded operations the Artifact Viewer serves.
 *
 * Every operation resolves an ArtifactSource (working tree or Git revision), reads the
 * canonical native source, and attaches Provenance. The artifact type never changes because
 * of where the state came from: a document read from an old commit is still Markdown.
 * Historical revisions are read-only by construction — there is no code path that writes to one.
 */
import { createHash } from "node:crypto";
import { readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ViewerError, confine } from "./paths.ts";
import type { Corpus } from "./corpus.ts";
import type { HistoryProvider } from "./git.ts";
import type { Artifact, CompareResponse, CompareSide, DocumentResponse, HistoryResponse, Provenance, RevisionRef, SaveResponse, WorkingTreeState } from "../../docs/.viewer/src/wire.ts";

const REVISION = /^(?:[0-9a-fA-F]{4,40}|HEAD)$/;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

const ASSET_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
};

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export class DocumentationService {
  readonly #corpus: Corpus;
  readonly #history: HistoryProvider;

  constructor(corpus: Corpus, history: HistoryProvider) {
    this.#corpus = corpus;
    this.#history = history;
  }

  #document(requested: unknown) {
    return confine(this.#corpus.root, requested, { extensions: [".md"] });
  }

  async #workingTree(repoPath: string): Promise<WorkingTreeState> {
    const availability = await this.#history.availability();
    if (!availability.available) {
      return { available: false, ...(availability.reason ? { reason: availability.reason } : {}), tracked: false, state: "unknown", porcelain: null, lastCommit: null, head: null };
    }
    try {
      const [facts, lastCommit, head] = await Promise.all([this.#history.workingTree(repoPath), this.#history.lastCommit(repoPath), this.#history.repositoryHead()]);
      return { available: true, ...facts, lastCommit, head };
    } catch (error) {
      const reason = error instanceof ViewerError ? (error.detail ?? error.message) : error instanceof Error ? error.message : String(error);
      return { available: false, reason, tracked: false, state: "unknown", porcelain: null, lastCommit: null, head: null };
    }
  }

  /** Resolve one source for a document path: the working tree, or a revision of it. */
  async document(requested: unknown, ref: unknown): Promise<DocumentResponse> {
    const target = this.#document(requested);
    const workingTree = await this.#workingTree(target.repoPath);
    const revision = typeof ref === "string" && ref.trim() !== "" && ref !== "working" ? ref.trim() : null;

    if (revision === null) {
      const content = await readFile(target.absolute, "utf8");
      const artifact: Artifact = { type: "markdown", path: target.repoPath, content };
      const provenance: Provenance = { source: "working-tree", path: target.repoPath, readOnly: false, workingTree };
      return { artifact, provenance, sha256: sha256(content) };
    }

    if (!REVISION.test(revision)) throw new ViewerError("invalid_path", "That is not a revision the viewer can read.", `Rejected: ${revision}`, 400);
    const revisionRef = await this.#resolveRevision(target.repoPath, revision);
    const content = await this.#history.content(revisionRef.pathAtRevision, revisionRef.hash);
    const artifact: Artifact = { type: "markdown", path: target.repoPath, content };
    const provenance: Provenance = { source: "revision", path: target.repoPath, revision: revisionRef, readOnly: true, workingTree };
    return { artifact, provenance, sha256: sha256(content) };
  }

  /** Find the revision a short hash or `HEAD` refers to, with the path the file had then. */
  async #resolveRevision(repoPath: string, revision: string): Promise<RevisionRef> {
    const wanted = revision === "HEAD" ? null : revision.toLowerCase();
    const entries = await this.#history.history(repoPath, 500);
    const match = entries.find((entry) => (wanted === null ? true : entry.hash.startsWith(wanted)));
    if (match) return match;
    if (wanted === null) {
      const head = await this.#history.repositoryHead();
      if (head) return { ...head, pathAtRevision: repoPath };
    }
    throw new ViewerError("not_found", `Revision ${revision} does not contain ${repoPath}.`, undefined, 404);
  }

  async history(requested: unknown, limit = 200): Promise<HistoryResponse> {
    const target = this.#document(requested);
    const bounded = Math.min(Math.max(Math.trunc(limit) || 200, 1), 1000);
    const availability = await this.#history.availability();
    if (!availability.available) {
      return { path: target.repoPath, follow: true, available: false, reason: availability.reason ?? "Git is unavailable.", entries: [] };
    }
    try {
      return { path: target.repoPath, follow: true, available: true, entries: await this.#history.history(target.repoPath, bounded) };
    } catch (error) {
      const reason = error instanceof ViewerError ? (error.detail ?? error.message) : error instanceof Error ? error.message : String(error);
      return { path: target.repoPath, follow: true, available: false, reason, entries: [] };
    }
  }

  async #side(repoPath: string, workingTree: WorkingTreeState, ref: string): Promise<CompareSide> {
    if (ref === "working") {
      const absolute = this.#document(repoPath).absolute;
      return { ref, label: "Working tree", content: await readFile(absolute, "utf8"), provenance: { source: "working-tree", path: repoPath, readOnly: false, workingTree } };
    }
    if (!REVISION.test(ref)) throw new ViewerError("invalid_path", "That is not a revision the viewer can compare.", `Rejected: ${ref}`, 400);
    const revision = await this.#resolveRevision(repoPath, ref);
    return {
      ref: revision.hash,
      label: `${revision.shortHash} · ${revision.date.slice(0, 10)}`,
      content: await this.#history.content(revision.pathAtRevision, revision.hash),
      provenance: { source: "revision", path: repoPath, revision, readOnly: true, workingTree },
    };
  }

  /** Both sides of a comparison travel through the same artifact pipeline as Read. */
  async compare(requested: unknown, from: unknown, to: unknown): Promise<CompareResponse> {
    const target = this.#document(requested);
    const workingTree = await this.#workingTree(target.repoPath);
    const fromRef = typeof from === "string" && from.trim() !== "" ? from.trim() : "HEAD";
    const toRef = typeof to === "string" && to.trim() !== "" ? to.trim() : "working";
    const [fromSide, toSide] = await Promise.all([this.#side(target.repoPath, workingTree, fromRef), this.#side(target.repoPath, workingTree, toRef)]);
    return { path: target.repoPath, from: fromSide, to: toSide };
  }

  /**
   * Write back to the canonical Markdown file. Only documents that already exist inside the
   * documentation root can be written, the write is never committed, and a file that changed
   * on disk since it was loaded is refused rather than overwritten.
   */
  async save(body: unknown): Promise<SaveResponse> {
    if (body === null || typeof body !== "object") throw new ViewerError("invalid_path", "A save request body is required.", undefined, 400);
    const { path: requested, content, expectedSha256 } = body as { path?: unknown; content?: unknown; expectedSha256?: unknown };
    if (typeof content !== "string") throw new ViewerError("invalid_path", "A save request needs Markdown content.", undefined, 400);
    if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES) throw new ViewerError("invalid_path", "That document is too large to save.", `Limit: ${MAX_DOCUMENT_BYTES} bytes`, 413);

    const target = this.#document(requested);
    const current = await readFile(target.absolute, "utf8");
    if (typeof expectedSha256 === "string" && expectedSha256 !== "" && sha256(current) !== expectedSha256) {
      throw new ViewerError("conflict", "This document changed on disk since you loaded it. Reload before saving.", target.repoPath, 409);
    }

    const temporary = join(dirname(target.absolute), `.viewer-save-${process.pid}-${crypto.randomUUID().slice(0, 8)}.tmp`);
    try {
      // Written beside the target and renamed into place: a partial write never becomes the document.
      await Bun.write(temporary, content);
      await rename(temporary, target.absolute);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw new ViewerError("internal", "The document could not be written.", error instanceof Error ? error.message : String(error), 500);
    }

    const info = await stat(target.absolute);
    return { path: target.repoPath, sha256: sha256(content), bytes: Buffer.byteLength(content, "utf8"), mtimeMs: Math.round(info.mtimeMs), workingTree: await this.#workingTree(target.repoPath) };
  }

  /** Artifacts referenced from documents (images today) are served only from inside the root. */
  asset(requested: unknown): { absolute: string; contentType: string } {
    const target = confine(this.#corpus.root, requested);
    const extension = (target.repoPath.split(".").pop() ?? "").toLowerCase();
    const contentType = ASSET_TYPES[extension];
    if (!contentType) throw new ViewerError("not_a_document", "That file type is not served.", target.repoPath, 415);
    return { absolute: target.absolute, contentType };
  }
}
