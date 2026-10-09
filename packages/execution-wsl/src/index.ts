// A WSL distribution as an execution world.
//
// `wsl.exe` is the fragile part: launching it can take seconds, and under load the Windows WSL
// service intermittently stalls or fails launches (observed: plain `wsl.exe -e true` taking 9–20 s).
// So the provider launches it as rarely as possible. It keeps a small POOL of persistent `sh -s`
// sessions per distribution and runs EVERYTHING through them — file operations and commands alike —
// as framed requests whose stdout, stderr and exit status come back between unique markers. In steady
// state an agent run launches no `wsl.exe` at all; only session start-up does, and a session that
// fails to come up is replaced once, then the world fails closed.
//
//  * A command runs in its own session/process group inside a pooled shell, so a timeout or abort can
//    end the whole tree: the group is killed from a *second* session (the busy one is occupied), and the
//    busy session is closed as a last resort (closing `wsl.exe` ends everything it started).
//  * Sessions are returned to the pool when idle and closed after a grace period once no world uses
//    them. A session's lifetime is bound to a stdin pipe, so it ends by itself if this process dies.
//  * No Windows path ever enters the contract: roots are POSIX paths inside the distribution.
import { randomUUID } from "node:crypto";
import { commandFileSystem, execScript, shellQuote, WorldUnavailableError } from "@godspeedai/cognate-execution";
import type { ExecResult, ExecSpec, ExecutionWorldProvider, ProcessPort, RunScript } from "@godspeedai/cognate-execution";

export interface WslWorldOptions {
  readonly worldId: string;
  readonly distro: string;
  /** Linux user inside the distro (`wsl.exe -u`). Omit for the distro default. */
  readonly user?: string;
  readonly wslBin?: string;
  /** Default command timeout. */
  readonly defaultTimeoutMs?: number;
  /** Stall budget for one file operation on an established session (idempotent; restarted and retried once). */
  readonly fileOpTimeoutMs?: number;
  /** How long a fresh session may take to come up (a `wsl.exe` launch can be slow). */
  readonly sessionStartTimeoutMs?: number;
  readonly maxOutputBytes?: number;
  /** Test seam: replaces the whole launch command (it must read the script from stdin like `sh -s`). */
  readonly shellCommand?: readonly string[];
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT = 10 * 1024 * 1024;
const SESSION_GRACE_MS = 20_000;
const MAX_IDLE = 4;
const BUFFER_LIMIT_FACTOR = 4;

interface Outcome { readonly done: boolean; readonly stdout: string; readonly stderr: string; readonly exitCode: number; readonly pid?: number }

/** One framed request on a session. Resumable: `wait()` may be called again after it reports pending. */
class Request {
  constructor(private readonly session: ShellSession, readonly token: string, private readonly maxBytes: number) {}
  private get outMark() { return new RegExp(`\\n${this.token}:(\\d+)\\n`); }
  private get errMark() { return `\n${this.token}:E\n`; }
  /** The pid announced by an exec frame (`<token>:pid:N`), as soon as it arrives. */
  get pid(): number | undefined {
    const m = new RegExp(`\\n${this.token}:pid:(\\d+)\\n`).exec(this.session.peekOut());
    return m ? Number(m[1]) : undefined;
  }
  async wait(timeoutMs: number): Promise<Outcome> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const done = this.session.tryComplete(this.outMark, this.errMark, this.token, this.maxBytes);
      if (done) return done;
      if (this.session.dead) return { done: false, ...this.session.partial(this.token, this.maxBytes), exitCode: -1 };
      if (Date.now() >= deadline) return { done: false, ...this.session.partial(this.token, this.maxBytes), exitCode: -1 };
      await this.session.nextChunk(Math.max(1, Math.min(100, deadline - Date.now())));
    }
  }
}

/** One long-lived `sh -s`; handles one request at a time (the pool guarantees exclusivity). */
class ShellSession {
  private out: Buffer = Buffer.alloc(0);
  private err: Buffer = Buffer.alloc(0);
  private waiters = new Set<() => void>();
  private readonly proc: ReturnType<typeof Bun.spawn> & { stdin: { write(d: string): unknown; end(): unknown }; stdout: ReadableStream<Uint8Array>; stderr: ReadableStream<Uint8Array> };
  dead = false;
  ready = false;
  overflowed = false;

  constructor(command: readonly string[], private readonly bufferLimit: number) {
    this.proc = Bun.spawn([...command], { stdin: "pipe", stdout: "pipe", stderr: "pipe" }) as ShellSession["proc"];
    void this.pump(this.proc.stdout, (b) => { this.out = Buffer.concat([this.out, b]); });
    void this.pump(this.proc.stderr, (b) => { this.err = Buffer.concat([this.err, b]); });
    void this.proc.exited.then(() => { this.dead = true; this.notify(); });
  }

  private async pump(stream: ReadableStream<Uint8Array>, sink: (b: Buffer) => void): Promise<void> {
    try {
      for await (const chunk of stream) {
        sink(Buffer.from(chunk));
        if (this.out.length + this.err.length > this.bufferLimit && !this.overflowed) { this.overflowed = true; this.close(); }
        this.notify();
      }
    } catch { /* stream closed */ }
  }
  private notify(): void { for (const w of [...this.waiters]) w(); }
  nextChunk(maxMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => { this.waiters.delete(done); clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, maxMs);
      this.waiters.add(done);
    });
  }
  peekOut(): string { return this.out.toString("latin1"); }

  /** Starts a framed request; `body(token)` is the script text and must be a complete shell command. */
  start(body: (token: string) => string, maxBytes: number): Request {
    const token = randomUUID().replace(/-/g, "");
    this.proc.stdin.write(`( ${body(token)}\n) </dev/null\nprintf '\\n${token}:%s\\n' "$?"\nprintf '\\n${token}:E\\n' >&2\n`);
    return new Request(this, token, maxBytes);
  }

  tryComplete(outMark: RegExp, errMark: string, token: string, maxBytes: number): Outcome | undefined {
    const m = outMark.exec(this.out.toString("latin1"));
    const ei = this.err.indexOf(errMark);
    if (!m || ei < 0) return undefined;
    let stdout = this.out.subarray(0, m.index);
    const stderr = this.err.subarray(0, ei);
    this.out = this.out.subarray(m.index + m[0].length);
    this.err = this.err.subarray(ei + errMark.length);
    const pidMark = new RegExp(`\\n${token}:pid:(\\d+)\\n`).exec(stdout.toString("latin1"));
    let pid: number | undefined;
    if (pidMark) { pid = Number(pidMark[1]); stdout = Buffer.concat([stdout.subarray(0, pidMark.index), stdout.subarray(pidMark.index + pidMark[0].length)]); }
    return { done: true, stdout: stdout.subarray(0, maxBytes).toString("utf8"), stderr: stderr.subarray(0, maxBytes).toString("utf8"), exitCode: Number(m[1]), ...(pid === undefined ? {} : { pid }) };
  }
  /** Whatever output has arrived for the request so far (pid marker removed). */
  partial(token: string, maxBytes: number): { stdout: string; stderr: string } {
    const text = this.out.toString("latin1");
    const pidMark = new RegExp(`\\n${token}:pid:(\\d+)\\n`).exec(text);
    const stdout = pidMark ? Buffer.concat([this.out.subarray(0, pidMark.index), this.out.subarray(pidMark.index + pidMark[0].length)]) : this.out;
    return { stdout: stdout.subarray(0, maxBytes).toString("utf8"), stderr: this.err.subarray(0, maxBytes).toString("utf8") };
  }

  /** Discard anything left over from an abandoned request, keeping the session usable. */
  reset(): void { this.out = Buffer.alloc(0); this.err = Buffer.alloc(0); }

  close(): void {
    if (this.dead && this.proc.killed) return;
    this.dead = true;
    try { this.proc.stdin.end(); } catch { /* already closed */ }
    this.proc.kill();
    this.notify();
  }
}

interface Pool { refs: number; idle: ShellSession[]; release?: ReturnType<typeof setTimeout> }
const pools = new Map<string, Pool>();

function acquirePool(key: string): { pool: Pool; release: () => void } {
  let pool = pools.get(key);
  if (!pool) { pool = { refs: 0, idle: [] }; pools.set(key, pool); }
  if (pool.release) { clearTimeout(pool.release); delete pool.release; }
  pool.refs++;
  const held = pool;
  let released = false;
  return {
    pool: held,
    release: () => {
      if (released) return;
      released = true;
      if (--held.refs > 0) return;
      // Keep the distribution warm briefly so back-to-back worlds don't race its idle shutdown.
      held.release = setTimeout(() => { if (pools.get(key) === held) pools.delete(key); for (const s of held.idle.splice(0)) s.close(); }, SESSION_GRACE_MS);
      (held.release as { unref?: () => void }).unref?.();
    },
  };
}

export function wslExecutionWorld(options: WslWorldOptions): ExecutionWorldProvider {
  const command = options.shellCommand ?? [options.wslBin ?? "wsl.exe", "-d", options.distro, ...(options.user ? ["-u", options.user] : []), "--cd", "/", "-e", "sh", "-s"];
  const key = command.join("\u0000");
  const maxOut = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
  const fileBudget = options.fileOpTimeoutMs ?? 10_000;
  const startBudget = options.sessionStartTimeoutMs ?? 45_000;
  let disposed = false;
  let held: ReturnType<typeof acquirePool> | undefined;
  const inUse = new Set<ShellSession>();
  const assertOpen = () => { if (disposed) throw new WorldUnavailableError(options.worldId, "execution world is disposed"); };
  const unavailable = (why: string) => new WorldUnavailableError(options.worldId, `${why}; the distribution "${options.distro}" is not responding`);

  function poolHandle() {
    return (held ??= acquirePool(key));
  }
  function newSession(): ShellSession {
    try { return new ShellSession(command, maxOut * BUFFER_LIMIT_FACTOR); }
    catch (e) { throw new WorldUnavailableError(options.worldId, `cannot start ${command[0]}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  /** An idle healthy session, or a fresh one that has proven it can answer (one replacement on failure). */
  async function checkout(): Promise<ShellSession> {
    const { pool } = poolHandle();
    for (let attempt = 1; ; attempt++) {
      let s = pool.idle.pop();
      while (s && (s.dead || !s.ready)) { s.close(); s = pool.idle.pop(); }
      if (!s) {
        s = newSession();
        const r = await s.start(() => "true", 64).wait(startBudget);
        if (!r.done) { s.close(); if (attempt >= 2) throw unavailable(`a wsl session did not start within ${startBudget}ms (twice)`); continue; }
        s.ready = true;
      }
      inUse.add(s);
      return s;
    }
  }
  function checkin(s: ShellSession, healthy: boolean): void {
    inUse.delete(s);
    const { pool } = poolHandle();
    if (healthy && !s.dead && !disposed && pool.idle.length < MAX_IDLE) { s.reset(); pool.idle.push(s); } else s.close();
  }

  // File operations: framed on a pooled session; a stalled request closes that session and retries once.
  const run: RunScript = async (script) => {
    assertOpen();
    for (let attempt = 1; ; attempt++) {
      const s = await checkout();
      const r = await s.start(() => script, maxOut).wait(fileBudget);
      if (r.done) { checkin(s, true); return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode }; }
      checkin(s, false);
      if (attempt >= 2 || disposed) throw unavailable(`a wsl command did not complete within ${fileBudget}ms (twice)`);
    }
  };

  /** End a command's whole process group from a different session; never throws. */
  async function killGroup(pid: number): Promise<void> {
    try {
      const k = await checkout();
      const r = await k.start(() => `kill -s TERM -- -${pid} 2>/dev/null; sleep 1; kill -s KILL -- -${pid} 2>/dev/null; true`, 64).wait(8_000);
      checkin(k, r.done);
    } catch { /* the busy session is closed by the caller as a last resort */ }
  }

  // Commands run inside a pooled session, in their own process group (setsid), so a timeout or abort
  // can end the whole tree. The pid is announced on stdout and stripped from the result.
  async function execIn(spec: ExecSpec, o?: { readonly signal?: AbortSignal }): Promise<ExecResult> {
    assertOpen();
    const timeoutMs = spec.timeoutMs ?? options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const s = await checkout();
    const body = (token: string) => {
      const inner = `printf '\\n${token}:pid:%s\\n' "$$"; ${execScript(spec.argv, spec.cwd, spec.env)}`;
      return `S=; command -v setsid >/dev/null 2>&1 && S=setsid; $S sh -c ${shellQuote(inner)}`;
    };
    const req = s.start(body, maxOut);
    let timedOut = false;
    let aborted = false;
    const onAbort = () => { aborted = true; };
    o?.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const deadline = Date.now() + timeoutMs;
      let outcome = await req.wait(Math.min(250, timeoutMs));
      while (!outcome.done && !aborted && Date.now() < deadline) outcome = await req.wait(Math.min(250, Math.max(1, deadline - Date.now())));
      if (outcome.done) { checkin(s, true); return { stdout: outcome.stdout, stderr: outcome.stderr, exitCode: outcome.exitCode, timedOut: false }; }
      if (!aborted) timedOut = true;
      // Timed out or aborted: end the process group from another session, then collect what remains.
      const pid = req.pid;
      if (pid !== undefined) await killGroup(pid);
      const after = await req.wait(pid === undefined ? 0 : 5_000);
      if (after.done) { checkin(s, true); return { stdout: after.stdout, stderr: after.stderr, exitCode: after.exitCode, timedOut }; }
      checkin(s, false); // last resort: closing wsl.exe ends everything it started
      return { stdout: after.stdout, stderr: after.stderr, exitCode: 143, timedOut };
    } finally {
      o?.signal?.removeEventListener("abort", onAbort);
      inUse.delete(s);
    }
  }

  const process_: ProcessPort = { exec: execIn };
  const fs = commandFileSystem(run);
  const guarded = <T extends (...a: any[]) => Promise<any>>(fn: T) => (async (...a: Parameters<T>) => { assertOpen(); return fn(...a); }) as T;
  return {
    worldId: options.worldId,
    kind: "wsl",
    metadata: { distro: options.distro, ...(options.user ? { user: options.user } : {}) },
    fileSystem: {
      resolve: fs.resolve,
      stat: guarded(fs.stat), exists: guarded(fs.exists), readText: guarded(fs.readText), list: guarded(fs.list), writeText: guarded(fs.writeText), version: guarded(fs.version),
    },
    process: { exec: guarded(process_.exec) },
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const s of inUse) s.close();
      inUse.clear();
      held?.release();
      held = undefined;
    },
  };
}
