/**
 * Path confinement for the Artifact Viewer's projection server.
 *
 * The launcher is a bounded local projection server, not a filesystem server: every
 * requested path is canonicalized and proven to live inside the documentation root
 * before it is read or written. Traversal, absolute paths, NUL bytes, and symlinks
 * that resolve outside the root are rejected.
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { ViewerErrorCode } from "../../docs/.viewer/src/wire.ts";

export class ViewerError extends Error {
  constructor(
    readonly code: ViewerErrorCode,
    message: string,
    readonly detail?: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ViewerError";
  }
}

export interface ConfinedPath {
  /** Absolute, symlink-resolved path on disk. */
  absolute: string;
  /** Repository-relative path, e.g. `docs/architecture.md`. */
  repoPath: string;
  /** Documentation-root-relative path, e.g. `architecture.md`. */
  relative: string;
}

/** True when `target` is the root itself or lives beneath it. */
export function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`));
}

/**
 * Resolve a requested path inside `root`.
 *
 * Both `docs/architecture.md` (the repository-relative form the API returns) and
 * `architecture.md` (the root-relative form a reader is likely to type) are accepted.
 * `mustExist` performs the symlink resolution; callers that write must pass `true`.
 */
export function confine(root: string, requested: unknown, options: { mustExist?: boolean; extensions?: readonly string[] } = {}): ConfinedPath {
  const { mustExist = true, extensions } = options;
  if (typeof requested !== "string" || requested.trim() === "") throw new ViewerError("invalid_path", "A document path is required.", "Send ?path=<repository-relative path>", 400);
  const raw = requested.trim();
  if (raw.includes("\0")) throw new ViewerError("invalid_path", "Path contains a NUL byte.", undefined, 400);
  if (raw.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(raw)) throw new ViewerError("outside_root", "Absolute paths are not served.", `Rejected: ${raw}`, 403);

  const segments = raw.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".");
  if (segments.some((segment) => segment === "..")) throw new ViewerError("outside_root", "Path traversal is not served.", `Rejected: ${raw}`, 403);

  const rootName = root.split(sep).pop() ?? "";
  const rootPrefixed = segments[0] === rootName;
  const absoluteRequested = rootPrefixed ? resolve(root, "..", ...segments) : resolve(root, ...segments);
  const repoPath = rootPrefixed ? segments.join("/") : `${rootName}/${segments.join("/")}`;

  if (extensions && !extensions.some((extension) => repoPath.toLowerCase().endsWith(extension))) {
    throw new ViewerError("not_a_document", `Only ${extensions.join(", ")} paths are served here.`, `Rejected: ${repoPath}`, 415);
  }

  let absolute = absoluteRequested;
  if (mustExist || existsSync(absoluteRequested)) {
    if (!existsSync(absoluteRequested)) throw new ViewerError("not_found", "That document does not exist.", repoPath, 404);
    absolute = realpathSync(absoluteRequested);
    if (!statSync(absolute).isFile()) throw new ViewerError("not_found", "That path is not a file.", repoPath, 404);
  }

  if (!isWithin(root, absolute)) throw new ViewerError("outside_root", "That path resolves outside the documentation root.", `Rejected: ${raw}`, 403);
  return { absolute, repoPath, relative: relative(root, absolute) };
}

/** The documentation root itself, canonicalized once at startup. */
export function resolveRoot(cwd: string, requested: string): string {
  const absolute = resolve(cwd, requested);
  if (!existsSync(absolute)) throw new ViewerError("not_found", `Documentation root not found: ${requested}`, absolute, 404);
  const real = realpathSync(absolute);
  if (!statSync(real).isDirectory()) throw new ViewerError("invalid_path", `Documentation root is not a directory: ${requested}`, absolute, 400);
  return real;
}
