/**
 * The Artifact Viewer's history boundary.
 *
 * Git is the documentation-history backend, and local Git alone satisfies Documentation
 * Mode: no network, no GitHub. The boundary is deliberately narrow — a provider answers
 * "what revisions does this path have?", "what did this revision contain?", "what is the
 * working tree doing?" — so that a later provider could enrich those answers with pull
 * request titles, review context, or release links without redesigning anything above it.
 * No such provider is implemented here.
 */
import { ViewerError } from "./paths.ts";
import type { RevisionRef } from "../../docs/.viewer/src/wire.ts";

export interface GitAvailability {
  available: boolean;
  reason?: string;
  version: string | null;
}

export type WorkingTreeStateName = "clean" | "modified" | "staged" | "untracked" | "deleted" | "renamed" | "unknown";

export interface WorkingTreeFacts {
  tracked: boolean;
  state: WorkingTreeStateName;
  porcelain: string | null;
}

export interface HistoryProvider {
  availability(): Promise<GitAvailability>;
  /** Revisions touching `repoPath`, newest first, following renames when Git can. */
  history(repoPath: string, limit: number): Promise<RevisionRef[]>;
  /** The canonical content of `pathAtRevision` at `ref` (`HEAD` or a commit hash). */
  content(pathAtRevision: string, ref: string): Promise<string>;
  lastCommit(repoPath: string): Promise<RevisionRef | null>;
  repositoryHead(): Promise<RevisionRef | null>;
  workingTree(repoPath: string): Promise<WorkingTreeFacts>;
}

/**
 * `%x1e` starts a record and `%x00` separates fields, written as Git escapes rather than as
 * literal control bytes: a spawn argument may not contain a NUL, and Git expands both escapes
 * in its output. Subjects cannot contain newlines, so a record never needs more than one line
 * of header before the name-status lines.
 */
const RECORD = "\u001e";
const FIELD = "\u0000";
const FORMAT = "%x1e%H%x00%h%x00%aI%x00%an%x00%ae%x00%s";

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class LocalGitProvider implements HistoryProvider {
  #availability: Promise<GitAvailability> | undefined;

  constructor(readonly repositoryRoot: string) {}

  #run(args: readonly string[]): Promise<GitResult> {
    const child = Bun.spawn(["git", ...args], { cwd: this.repositoryRoot, stdout: "pipe", stderr: "pipe" });
    return Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]).then(([code, stdout, stderr]) => ({ code, stdout, stderr }));
  }

  async #must(args: readonly string[], what: string): Promise<string> {
    let result: GitResult;
    try {
      result = await this.#run(args);
    } catch (error) {
      throw new ViewerError("git_unavailable", "Git could not be executed.", error instanceof Error ? error.message : String(error), 503);
    }
    if (result.code !== 0) {
      throw new ViewerError("git_unavailable", `Git could not ${what}.`, result.stderr.trim() || `git ${args[0]} exited ${result.code}`, 503);
    }
    return result.stdout;
  }

  async availability(): Promise<GitAvailability> {
    this.#availability ??= (async (): Promise<GitAvailability> => {
      let version: string | null = null;
      try {
        const versioned = await this.#run(["--version"]);
        version = versioned.code === 0 ? versioned.stdout.trim() : null;
      } catch {
        return { available: false, reason: "Git is not installed or not on PATH.", version: null };
      }
      try {
        const inside = await this.#run(["rev-parse", "--is-inside-work-tree"]);
        if (inside.code !== 0 || inside.stdout.trim() !== "true") {
          return { available: false, reason: inside.stderr.trim() || "This directory is not inside a Git working tree.", version };
        }
      } catch (error) {
        return { available: false, reason: error instanceof Error ? error.message : String(error), version };
      }
      return { available: true, version };
    })();
    return this.#availability;
  }

  #parseRef(chunk: string, pathAtRevision: string): RevisionRef | null {
    const [header] = chunk.split("\n");
    const fields = (header ?? "").split(FIELD);
    if (fields.length < 6 || !fields[0]) return null;
    const [hash, shortHash, date, author, email, subject] = fields as [string, string, string, string, string, string];
    return { hash, shortHash, date, author, email, subject, pathAtRevision };
  }

  /** The path this file had at each revision, walking newest → oldest through renames. */
  #trackRenames(chunks: readonly string[], repoPath: string): Map<string, string> {
    const byHash = new Map<string, string>();
    let current = repoPath;
    for (const chunk of chunks) {
      const [header, ...statusLines] = chunk.split("\n");
      const hash = (header ?? "").split(FIELD)[0];
      if (!hash) continue;
      byHash.set(hash, current);
      for (const line of statusLines) {
        if (!line.trim()) continue;
        const [code, first, second] = line.split("\t");
        // `R100\told\tnew` — the file was named `new` at this revision and `old` before it.
        if (code?.startsWith("R") && first && second && second === current) current = first;
      }
    }
    return byHash;
  }

  async history(repoPath: string, limit: number): Promise<RevisionRef[]> {
    const stdout = await this.#must(
      ["-c", "core.quotepath=false", "log", "--follow", "--name-status", "-M", `--max-count=${limit}`, `--format=${FORMAT}`, "--", repoPath],
      `read history for ${repoPath}`,
    );
    const chunks = stdout.split(RECORD).filter((chunk) => chunk.trim() !== "");
    const paths = this.#trackRenames(chunks, repoPath);
    return chunks.flatMap((chunk) => {
      const hash = (chunk.split("\n")[0] ?? "").split(FIELD)[0] ?? "";
      const ref = this.#parseRef(chunk, paths.get(hash) ?? repoPath);
      return ref ? [ref] : [];
    });
  }

  async content(pathAtRevision: string, ref: string): Promise<string> {
    return this.#must(["-c", "core.quotepath=false", "show", `${ref}:${pathAtRevision}`], `read ${pathAtRevision} at ${ref}`);
  }

  #firstRevision(stdout: string, repoPath: string): RevisionRef | null {
    const chunk = stdout.replace(RECORD, "").trim();
    return chunk ? this.#parseRef(chunk, repoPath) : null;
  }

  async lastCommit(repoPath: string): Promise<RevisionRef | null> {
    const stdout = await this.#must(["-c", "core.quotepath=false", "log", "-1", `--format=${FORMAT}`, "--", repoPath], `read the last commit for ${repoPath}`);
    return this.#firstRevision(stdout, repoPath);
  }

  async repositoryHead(): Promise<RevisionRef | null> {
    const result = await this.#run(["-c", "core.quotepath=false", "log", "-1", `--format=${FORMAT}`]);
    if (result.code !== 0) return null; // a repository with no commits is a legitimate degraded state
    return this.#firstRevision(result.stdout, "");
  }

  async workingTree(repoPath: string): Promise<WorkingTreeFacts> {
    const result = await this.#run(["status", "--porcelain=v1", "--", repoPath]);
    if (result.code !== 0) throw new ViewerError("git_unavailable", "Git could not read the working-tree status.", result.stderr.trim(), 503);
    const line = result.stdout.split("\n").find((entry) => entry.trim() !== "") ?? null;
    if (!line) {
      // An ignored path reports nothing at all, and the interface must not call it tracked.
      const tracked = await this.#run(["ls-files", "--error-unmatch", "--", repoPath]);
      return tracked.code === 0 ? { tracked: true, state: "clean", porcelain: null } : { tracked: false, state: "untracked", porcelain: null };
    }
    return { tracked: !line.startsWith("??") && !line.startsWith("A "), state: this.#state(line), porcelain: line };
  }

  #state(line: string): WorkingTreeStateName {
    const index = line[0] ?? " ";
    const worktree = line[1] ?? " ";
    if (index === "?" || worktree === "?") return "untracked";
    if (index === "R") return "renamed";
    if (index === "D" || worktree === "D") return "deleted";
    if (index !== " " && index !== "?") return "staged";
    if (worktree === "M" || worktree === "T") return "modified";
    return "unknown";
  }
}
