// An SSH host as an execution world (ssh2). Files go over SFTP, commands over `exec`. Everything
// the contracts promise holds here: containment at `resolve` plus a symlink-safe check before each
// file operation; a missing path is `undefined`; timeouts and aborts end the remote command; and the
// world FAILS CLOSED — an unreachable host, a changed host key or a disposed world raises
// WorldUnavailableError and nothing ever falls back to local execution.
//
// Mechanism only is borrowed from the studied donor (connection reuse, lazy SFTP, ProxyJump via
// forwardOut); the code is original and, unlike the donor, host-key verification is mandatory.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "ssh2";
import type { ClientChannel, ConnectConfig, SFTPWrapper } from "ssh2";
import { PathEscapeError, WorldUnavailableError, createRootGuard, shellQuote, supervisedExecScript } from "@cognate/execution";
import type { DirEntry, ExecResult, ExecSpec, ExecutionWorldProvider, FileStat } from "@cognate/execution";
import { checkKnownHosts, fingerprintOf, policyIsEmpty, verifyHostKey } from "./hostKeys.ts";
import type { HostKeyPolicy } from "./hostKeys.ts";

export { fingerprintOf, checkKnownHosts, verifyHostKey } from "./hostKeys.ts";
export type { HostKeyPolicy } from "./hostKeys.ts";

export type SshAuth =
  | { readonly kind: "password"; readonly password: string }
  | { readonly kind: "key"; readonly privateKey?: string; readonly privateKeyPath?: string; readonly passphrase?: string }
  | { readonly kind: "agent"; readonly socket?: string };

export interface SshHop {
  readonly host: string;
  readonly port?: number;
  readonly username: string;
  readonly auth: SshAuth;
  readonly hostKeys: HostKeyPolicy;
}

export interface SshWorldOptions extends SshHop {
  readonly worldId: string;
  /** Intermediate hosts, outermost first (ProxyJump). Each hop is verified like the target. */
  readonly jump?: readonly SshHop[];
  readonly readyTimeoutMs?: number;
  readonly keepaliveMs?: number;
  readonly defaultTimeoutMs?: number;
  readonly maxOutputBytes?: number;
}

/** The server's identity did not match the configured policy. Never retried, never bypassed. */
export class HostKeyMismatchError extends WorldUnavailableError {
  override readonly name = "HostKeyMismatchError";
  constructor(worldId: string, readonly host: string, readonly offered: string) {
    super(worldId, `host key for ${host} (${offered}) does not match the configured host-key policy`);
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT = 10 * 1024 * 1024;
const NO_SUCH_FILE = 2;

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
}

function authConfig(auth: SshAuth): Partial<ConnectConfig> {
  switch (auth.kind) {
    case "password": return { password: auth.password };
    case "key": {
      const privateKey = auth.privateKey ?? (auth.privateKeyPath ? readFileSync(expandHome(auth.privateKeyPath), "utf8") : undefined);
      if (!privateKey) throw new Error("ssh key auth needs privateKey or privateKeyPath");
      return { privateKey, ...(auth.passphrase ? { passphrase: auth.passphrase } : {}) };
    }
    case "agent": {
      const agent = auth.socket ?? process.env.SSH_AUTH_SOCK;
      if (!agent) throw new Error("ssh agent auth needs a socket (SSH_AUTH_SOCK is unset)");
      return { agent };
    }
  }
}

function connectReady(client: Client, config: ConnectConfig): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const done = () => { client.removeListener("error", fail); resolve(); };
    const fail = (e: Error) => { client.removeListener("ready", done); reject(e); };
    client.once("ready", done);
    client.once("error", fail);
    client.connect(config);
  });
}

const call = <T>(fn: (cb: (err: Error | null | undefined, value: T) => void) => void): Promise<T> =>
  new Promise<T>((resolve, reject) => fn((err, value) => (err ? reject(err) : resolve(value))));

export function sshExecutionWorld(options: SshWorldOptions): ExecutionWorldProvider {
  const { worldId } = options;
  const port = options.port ?? 22;
  const maxOut = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
  const hops: readonly SshHop[] = [...(options.jump ?? []), options];
  for (const hop of hops) if (policyIsEmpty(hop.hostKeys)) throw new Error(`ssh world ${worldId}: a host-key policy (fingerprints or known_hosts) is required for ${hop.host}`);

  let disposed = false;
  let clients: Client[] = [];
  let opening: Promise<Client> | undefined;
  let sftpOpening: Promise<SFTPWrapper> | undefined;
  let sftp: SFTPWrapper | undefined;
  let observedFingerprint: string | undefined;
  const channels = new Set<ClientChannel>();

  const closed = (): never => { throw new WorldUnavailableError(worldId, "execution world is disposed"); };

  function invalidate(): void {
    const old = clients;
    clients = []; opening = undefined; sftpOpening = undefined; sftp = undefined;
    for (const c of old.reverse()) try { c.end(); } catch { /* already closed */ }
  }

  async function open(): Promise<Client> {
    const made: Client[] = [];
    try {
      for (let i = 0; i < hops.length; i++) {
        const hop = hops[i]!;
        const hopPort = hop.port ?? (hop === options ? port : 22);
        const client = new Client();
        client.on("error", () => { /* surfaced via connectReady / invalidate; never an uncaught process error */ });
        made.push(client);
        let mismatch: string | undefined;
        const config: ConnectConfig = {
          host: hop.host, port: hopPort, username: hop.username,
          readyTimeout: options.readyTimeoutMs ?? 20_000,
          keepaliveInterval: options.keepaliveMs ?? 15_000, keepaliveCountMax: 3,
          ...authConfig(hop.auth),
          hostVerifier: (key: Buffer) => {
            const ok = verifyHostKey(hop.hostKeys, hop.host, hopPort, key);
            if (!ok) mismatch = fingerprintOf(key);
            else if (i === hops.length - 1) observedFingerprint = fingerprintOf(key);
            return ok;
          },
        };
        const prev = made[i - 1];
        try {
          if (!prev) await connectReady(client, config);
          else {
            const sock = await call<NodeJS.ReadableStream & NodeJS.WritableStream>((cb) => prev.forwardOut("127.0.0.1", 0, hop.host, hopPort, cb as never));
            await connectReady(client, { ...config, sock: sock as never });
          }
        } catch (e) {
          if (mismatch) throw new HostKeyMismatchError(worldId, hop.host, mismatch);
          throw e;
        }
      }
      const target = made[made.length - 1]!;
      clients = made;
      target.on("close", () => { if (clients[clients.length - 1] === target) invalidate(); });
      target.on("error", () => { if (clients[clients.length - 1] === target) invalidate(); });
      return target;
    } catch (e) {
      for (const c of made.reverse()) try { c.end(); } catch { /* best effort */ }
      throw e instanceof WorldUnavailableError ? e : new WorldUnavailableError(worldId, `cannot connect to ${options.username}@${options.host}:${port}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function getClient(): Promise<Client> {
    if (disposed) closed();
    opening ??= open().catch((e) => { opening = undefined; throw e; });
    const c = await opening;
    if (disposed) closed();
    return c;
  }

  async function getSftp(): Promise<SFTPWrapper> {
    if (sftp) return sftp;
    sftpOpening ??= (async () => {
      const client = await getClient();
      const s = await call<SFTPWrapper>((cb) => client.sftp(cb as never));
      const drop = () => { if (sftp === s) { sftp = undefined; sftpOpening = undefined; } };
      s.on("close", drop); s.on("end", drop);
      sftp = s;
      return s;
    })().catch((e) => { sftpOpening = undefined; throw e instanceof WorldUnavailableError ? e : new WorldUnavailableError(worldId, `sftp unavailable: ${e instanceof Error ? e.message : String(e)}`); });
    return sftpOpening;
  }

  const isConnectionError = (e: unknown) => e instanceof Error && /not connected|no sftp connection|channel (closed|open failure)|ECONNRESET|socket/i.test(e.message) && !(e instanceof WorldUnavailableError);
  /** Idempotent operations get exactly one transparent reconnect; anything else surfaces the failure. */
  async function withSftp<T>(fn: (s: SFTPWrapper) => Promise<T>): Promise<T> {
    if (disposed) closed();
    try {
      return await fn(await getSftp());
    } catch (e) {
      if (!isConnectionError(e)) throw e;
      invalidate();
      return fn(await getSftp());
    }
  }

  const statRaw = (path: string) => withSftp(async (s) => {
    try { return await call<import("ssh2").Stats>((cb) => s.stat(path, cb as never)); }
    catch (e) { if ((e as { code?: number }).code === NO_SUCH_FILE) return undefined; throw e; }
  });
  const realpath = (path: string) => withSftp(async (s) => {
    try { return await call<string>((cb) => s.realpath(path, cb as never)); }
    catch (e) { if ((e as { code?: number }).code === NO_SUCH_FILE) return undefined; throw e; }
  });
  const guard = createRootGuard(realpath);
  const kindOf = (st: { isFile(): boolean; isDirectory(): boolean }): FileStat["kind"] => (st.isFile() ? "file" : st.isDirectory() ? "directory" : "other");
  const versionOf = (st: { size: number; mtime: number }) => `${st.mtime}:${st.size}`;

  async function exec(spec: ExecSpec, o?: { readonly signal?: AbortSignal }): Promise<ExecResult> {
    const client = await getClient();
    const command = `exec sh -c ${shellQuote(supervisedExecScript(spec.argv, spec.cwd, spec.env))}`;
    return new Promise<ExecResult>((resolve, reject) => {
      let timedOut = false;
      let stream: ClientChannel | undefined;
      let settled = false;
      const out: Buffer[] = []; const err: Buffer[] = [];
      let outSize = 0; let errSize = 0;
      const kill = () => {
        if (!stream) return;
        // TERM reaches the supervisor (which ends the command's process group); closing the channel
        // is the fallback for servers that ignore signal requests: stdin EOF triggers the same cleanup.
        try { stream.signal("TERM"); } catch { /* server may ignore signals */ }
        try { stream.close(); } catch { /* already closed */ }
      };
      const timer = setTimeout(() => { timedOut = true; kill(); }, spec.timeoutMs ?? options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS);
      const onAbort = () => kill();
      const finish = (r: ExecResult) => {
        if (settled) return;
        settled = true; clearTimeout(timer); o?.signal?.removeEventListener("abort", onAbort);
        if (stream) channels.delete(stream);
        resolve(r);
      };
      client.exec(command, { pty: false }, (e, s) => {
        if (e) { clearTimeout(timer); reject(new WorldUnavailableError(worldId, `exec failed: ${e.message}`)); return; }
        stream = s; channels.add(s);
        s.on("data", (d: Buffer) => { if (outSize < maxOut) { out.push(d); outSize += d.length; } });
        s.stderr.on("data", (d: Buffer) => { if (errSize < maxOut) { err.push(d); errSize += d.length; } });
        s.on("close", (code: number | null) => finish({ stdout: Buffer.concat(out).subarray(0, maxOut).toString("utf8"), stderr: Buffer.concat(err).subarray(0, maxOut).toString("utf8"), exitCode: code ?? -1, timedOut }));
        if (o?.signal?.aborted) kill(); else o?.signal?.addEventListener("abort", onAbort, { once: true });
      });
    });
  }

  return {
    worldId,
    kind: "ssh",
    get metadata() {
      return {
        host: options.host, port: String(port), username: options.username, auth: options.auth.kind,
        ...(options.jump?.length ? { jump: options.jump.map((h) => `${h.username}@${h.host}`).join(",") } : {}),
        ...(observedFingerprint ? { hostKey: observedFingerprint } : {}),
      };
    },
    fileSystem: {
      resolve: (root, path) => guard.resolve(root, path),
      async stat(path): Promise<FileStat | undefined> {
        await guard.assertContained(path);
        const st = await statRaw(path);
        return st ? { kind: kindOf(st), size: st.size, version: versionOf(st) } : undefined;
      },
      async exists(path) { await guard.assertContained(path); return (await statRaw(path)) !== undefined; },
      async version(path) { await guard.assertContained(path); const st = await statRaw(path); return st ? versionOf(st) : undefined; },
      async readText(path) {
        await guard.assertContained(path);
        return withSftp(async (s) => (await call<Buffer>((cb) => s.readFile(path, cb as never))).toString("utf8"));
      },
      async list(path): Promise<readonly DirEntry[]> {
        await guard.assertContained(path);
        return withSftp(async (s) => (await call<{ filename: string; attrs: { isFile(): boolean; isDirectory(): boolean } }[]>((cb) => s.readdir(path, cb as never)))
          .filter((e) => e.filename !== "." && e.filename !== "..")
          .map((e) => ({ name: e.filename, kind: kindOf(e.attrs) })));
      },
      async writeText(path, content) {
        await guard.assertContained(path);
        if (disposed) closed();
        // Writes are not retried: a half-completed write must surface, not repeat.
        const s = await getSftp();
        await call<void>((cb) => s.writeFile(path, Buffer.from(content, "utf8"), cb as never));
      },
    },
    process: { exec },
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const ch of channels) try { ch.close(); } catch { /* closing */ }
      channels.clear();
      if (sftp) try { sftp.end(); } catch { /* closing */ }
      invalidate();
    },
  };
}

export { PathEscapeError };

export interface HostKeyProbe {
  readonly fingerprint: string;
  readonly keyType: string;
  /** Whether the key is already trusted in the given known_hosts text (never decides trust by itself). */
  readonly known?: "trusted" | "unknown" | "revoked";
}

/**
 * Reads a server's host key and stops: the verifier records the key and then REFUSES it, so nothing
 * is ever authenticated or sent. The caller shows the fingerprint to a human, who decides whether to
 * pin it; trust is a human act, never a side effect of connecting.
 */
export function probeHostKey(options: { readonly host: string; readonly port?: number; readonly timeoutMs?: number; readonly knownHosts?: string }): Promise<HostKeyProbe> {
  const port = options.port ?? 22;
  return new Promise((resolve, reject) => {
    const client = new Client();
    let seen: Buffer | undefined;
    let settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; try { client.end(); } catch { /* closing */ } fn(); };
    client.on("error", (e) => finish(() => {
      if (seen) resolve(describe(seen));
      else reject(new Error(`cannot reach ${options.host}:${port}: ${e.message}`));
    }));
    const describe = (key: Buffer): HostKeyProbe => {
      const typeLength = key.readUInt32BE(0);
      return {
        fingerprint: fingerprintOf(key),
        keyType: key.subarray(4, 4 + typeLength).toString("ascii"),
        ...(options.knownHosts === undefined ? {} : { known: checkKnownHosts(options.knownHosts, options.host, port, key) }),
      };
    };
    client.connect({ host: options.host, port, username: "cognate-probe", readyTimeout: options.timeoutMs ?? 10_000, hostVerifier: (key: Buffer) => { seen = key; return false; } });
  });
}
