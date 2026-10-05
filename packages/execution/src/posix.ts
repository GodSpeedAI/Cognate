// Containment for providers whose roots are POSIX paths they do not own locally (SSH, WSL,
// containers). `resolve` stays synchronous and lexical, as the FileSystemPort contract requires;
// `RootGuard` adds the symlink check the lexical rule cannot do, using a provider-supplied
// `realpath`, so a link inside the root that points outside it is still refused.
import { posix } from "node:path";
import { PathEscapeError } from "./types.ts";

/** Canonicalize `path` under the absolute POSIX `root`; throws PathEscapeError on any escape. */
export function resolvePosix(root: string, path: string): string {
  if (!posix.isAbsolute(root)) throw new PathEscapeError(`root must be an absolute POSIX path: ${root}`);
  const base = posix.resolve(root);
  const resolved = posix.resolve(base, path);
  if (resolved !== base && !resolved.startsWith(base === "/" ? "/" : `${base}/`)) throw new PathEscapeError(path);
  return resolved;
}

/** POSIX single-quote a shell argument. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function commandWords(argv: readonly string[], env?: Readonly<Record<string, string>>): string {
  if (argv.length === 0) throw new Error("exec: empty argv");
  const envPart = env && Object.keys(env).length > 0 ? `env ${Object.entries(env).map(([k, v]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new Error(`exec: invalid environment name ${k}`);
    return `${k}=${shellQuote(v)}`;
  }).join(" ")} ` : "";
  return `${envPart}${argv.map(shellQuote).join(" ")}`;
}

/** `cd -- <cwd> && exec [env K=V ...] <argv...>` — a POSIX script that is the same on every command-based world. */
export function execScript(argv: readonly string[], cwd: string, env?: Readonly<Record<string, string>>): string {
  return `cd -- ${shellQuote(cwd)} && exec ${commandWords(argv, env)}`;
}

/**
 * Remembers the roots handed to `resolve` and verifies, with the world's own `realpath`, that the
 * real location of a path (or of its nearest existing parent, for a file about to be created) is
 * still inside the real location of its root.
 */
export function createRootGuard(realpath: (path: string) => Promise<string | undefined>) {
  const roots = new Set<string>();
  const realRoots = new Map<string, string>();
  return {
    resolve(root: string, path: string): string {
      const resolved = resolvePosix(root, path);
      roots.add(posix.resolve(root));
      return resolved;
    },
    async assertContained(path: string): Promise<void> {
      const candidates = [...roots].filter((r) => path === r || path.startsWith(r === "/" ? "/" : `${r}/`)).sort((a, b) => b.length - a.length);
      const root = candidates[0];
      if (!root) return; // not a path this provider issued; the lexical rule already applied at resolve
      let realRoot = realRoots.get(root);
      if (realRoot === undefined) {
        realRoot = (await realpath(root)) ?? root;
        realRoots.set(root, realRoot);
      }
      let probe = path;
      for (;;) {
        const real = await realpath(probe);
        if (real !== undefined) {
          if (real !== realRoot && !real.startsWith(realRoot === "/" ? "/" : `${realRoot}/`)) throw new PathEscapeError(path);
          return;
        }
        const parent = posix.dirname(probe);
        if (parent === probe || probe === root) return;
        probe = parent;
      }
    },
  };
}

/**
 * Like {@link execScript}, but supervised: the command runs in its own session/process group and is
 * ended when (a) the supervisor receives TERM/HUP/INT, or (b) its stdin reaches EOF — which is what a
 * closed channel or a dropped connection looks like to a pty-less remote command. Without this a
 * cancelled or timed-out command can outlive the connection that started it. Only for worlds where
 * stdin is the command's own channel (SSH); a world that feeds the *script* on stdin must not use it.
 * The watcher is handed the supervisor's stdin explicitly (`<&3`) because POSIX gives background
 * jobs /dev/null otherwise, and it holds no stdout/stderr so it never delays the channel closing.
 */
export function supervisedExecScript(argv: readonly string[], cwd: string, env?: Readonly<Record<string, string>>): string {
  return [
    `cd -- ${shellQuote(cwd)} || exit 127`,
    "exec 3<&0",
    "S=; command -v setsid >/dev/null 2>&1 && S=setsid",
    `( exec $S ${commandWords(argv, env)} ) &`,
    "c=$!",
    't() { kill -s TERM -- -$c 2>/dev/null || kill -s TERM $c 2>/dev/null; sleep 1; kill -s KILL -- -$c 2>/dev/null || kill -s KILL $c 2>/dev/null; }',
    "trap 't; exit 143' TERM HUP INT",
    "( cat <&3 >/dev/null 2>&1; t ) >/dev/null 2>&1 &",
    "w=$!",
    "wait $c",
    "r=$?",
    "kill $w 2>/dev/null",
    "exit $r",
  ].join("\n");
}
