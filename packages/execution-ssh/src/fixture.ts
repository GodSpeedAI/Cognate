// A real SSH server (ssh2 `Server`) for deterministic tests: password/public-key auth, `exec` that
// runs a real local shell, an SFTP subset backed by the real filesystem, and direct-tcpip forwarding
// (so ProxyJump can be exercised). It is a test double for the *remote end only* — the provider
// under test is the genuine client. Counters expose connection/session lifecycle for disposal tests.
import { createServer as netServer, connect } from "node:net";
import { promises as fsp, constants as fsc } from "node:fs";
import { dirname, resolve } from "node:path";
import { Server, utils } from "ssh2";
import type { Connection, ServerChannel } from "ssh2";
import { fingerprintOf } from "./hostKeys.ts";

const { STATUS_CODE, OPEN_MODE } = utils.sftp;

export interface SshFixtureOptions {
  readonly users: Readonly<Record<string, { readonly password?: string; readonly publicKeys?: readonly string[] }>>;
  /** Reuse a host key (PEM) so a test can present a *different* identity on the same port. */
  readonly hostKeyPem?: string;
  /** Set to refuse `signal` requests like a server that ignores them. */
  readonly ignoreSignals?: boolean;
}

export interface SshFixture {
  readonly port: number;
  readonly hostKeyPem: string;
  readonly hostKeyBlob: Buffer;
  readonly fingerprint: string;
  readonly knownHostsLine: (host?: string) => string;
  readonly stats: { connections: number; open: number; execs: number; sftp: number; sftpOpens: number; liveExecs: number };
  dropConnections(): void;
  close(): Promise<void>;
}

const attrsOf = (st: import("node:fs").Stats) => ({ mode: st.mode, uid: st.uid, gid: st.gid, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) });

export async function startSshFixture(options: SshFixtureOptions): Promise<SshFixture> {
  const generated = options.hostKeyPem ? undefined : utils.generateKeyPairSync("ed25519");
  const hostKeyPem = options.hostKeyPem ?? generated!.private;
  const parsed = utils.parseKey(hostKeyPem);
  if (parsed instanceof Error) throw parsed;
  const hostKeyBlob = parsed.getPublicSSH();
  const stats = { connections: 0, open: 0, execs: 0, sftp: 0, sftpOpens: 0, liveExecs: 0 };
  const conns = new Set<Connection>();
  const sockets = new Set<import("node:net").Socket>();

  const server = new Server({ hostKeys: [hostKeyPem] }, (client) => {
    stats.connections++; stats.open++; conns.add(client);
    client.on("close", () => { stats.open--; conns.delete(client); });
    client.on("error", () => {});
    client.on("authentication", (ctx) => {
      const user = options.users[ctx.username];
      if (!user) return ctx.reject();
      if (ctx.method === "password" && user.password !== undefined && ctx.password === user.password) return ctx.accept();
      if (ctx.method === "publickey" && user.publicKeys) {
        const offered = ctx.key;
        const ok = user.publicKeys.some((k) => { const p = utils.parseKey(k); return !(p instanceof Error) && p.getPublicSSH().equals(offered.data); });
        if (ok && (!ctx.signature || ctx.blob)) {
          if (!ctx.signature) return ctx.accept();
          const p = utils.parseKey(user.publicKeys.find((k) => { const q = utils.parseKey(k); return !(q instanceof Error) && q.getPublicSSH().equals(offered.data); })!);
          if (!(p instanceof Error) && p.verify(ctx.blob!, ctx.signature, ctx.hashAlgo as never) === true) return ctx.accept();
        }
      }
      return ctx.reject(["password", "publickey"]);
    });
    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        let child: ReturnType<typeof Bun.spawn> | undefined;
        session.on("signal", (acc) => { acc?.(); if (!options.ignoreSignals) child?.kill(); });
        session.on("exec", (acc, _rej, info) => {
          const channel: ServerChannel = acc();
          stats.execs++; stats.liveExecs++;
          const proc = Bun.spawn(["sh", "-c", info.command], { stdout: "pipe", stderr: "pipe", stdin: "pipe" });
          child = proc;
          const stdin = proc.stdin;
          channel.on("data", (d: Buffer) => { try { stdin.write(d); } catch { /* child gone */ } });
          // Like sshd without a pty: channel EOF/close closes the command's stdin; it does NOT kill it.
          const closeStdin = () => { try { void stdin.end(); } catch { /* already closed */ } };
          channel.on("end", closeStdin); channel.on("close", closeStdin);
          const pump = async (src: ReadableStream<Uint8Array>, write: (b: Buffer) => void) => { for await (const c of src) write(Buffer.from(c)); };
          void Promise.all([pump(child.stdout as ReadableStream<Uint8Array>, (b) => channel.write(b)), pump(child.stderr as ReadableStream<Uint8Array>, (b) => channel.stderr.write(b))]).then(async () => {
            const code = await child!.exited;
            stats.liveExecs--;
            try { channel.exit(code ?? 255); channel.end(); } catch { /* channel gone */ }
          });
        });
        session.on("sftp", (acc) => { stats.sftp++; serveSftp(acc(), stats); });
      });
      client.on("tcpip", (acc, rej, info) => {
        const sock = connect(info.destPort, info.destIP);
        sockets.add(sock);
        sock.once("error", () => rej());
        sock.once("connect", () => { const ch = acc(); ch.pipe(sock).pipe(ch); ch.on("close", () => sock.destroy()); });
        sock.on("close", () => sockets.delete(sock));
      });
    });
  });
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const port = (server.address() as { port: number }).port;
  return {
    port, hostKeyPem, hostKeyBlob, fingerprint: fingerprintOf(hostKeyBlob), stats,
    knownHostsLine: (host = "127.0.0.1") => `[${host}]:${port} ${parsed.type} ${hostKeyBlob.toString("base64")}`,
    dropConnections() { for (const c of conns) c.end(); for (const s of sockets) s.destroy(); },
    async close() { for (const c of conns) c.end(); for (const s of sockets) s.destroy(); await new Promise<void>((r) => server.close(() => r())); },
  };
}

function serveSftp(sftp: import("ssh2").SFTPWrapper, stats: { sftpOpens: number }): void {
  type H = { kind: "file"; fd: import("node:fs/promises").FileHandle } | { kind: "dir"; entries: string[]; path: string; done: boolean };
  const handles = new Map<number, H>();
  let next = 1;
  const handleBuf = (id: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(id); return b; };
  const idOf = (b: Buffer) => b.readUInt32BE(0);
  const fail = (reqid: number, e: unknown) => sftp.status(reqid, (e as NodeJS.ErrnoException)?.code === "ENOENT" ? STATUS_CODE.NO_SUCH_FILE : (e as NodeJS.ErrnoException)?.code === "EACCES" ? STATUS_CODE.PERMISSION_DENIED : STATUS_CODE.FAILURE);
  const ok = (reqid: number) => sftp.status(reqid, STATUS_CODE.OK);

  sftp.on("REALPATH", async (reqid, path) => {
    try { const real = await fsp.realpath(path); sftp.name(reqid, [{ filename: real, longname: real, attrs: {} as never }]); } catch (e) { fail(reqid, e); }
  });
  const doStat = (follow: boolean) => async (reqid: number, path: string) => {
    try { const st = await (follow ? fsp.stat(path) : fsp.lstat(path)); sftp.attrs(reqid, attrsOf(st) as never); } catch (e) { fail(reqid, e); }
  };
  sftp.on("STAT", doStat(true)); sftp.on("LSTAT", doStat(false));
  sftp.on("FSTAT", async (reqid, h) => { const e = handles.get(idOf(h)); if (e?.kind !== "file") return sftp.status(reqid, STATUS_CODE.FAILURE); try { sftp.attrs(reqid, attrsOf(await e.fd.stat()) as never); } catch (er) { fail(reqid, er); } });
  sftp.on("OPEN", async (reqid, path, flags) => {
    stats.sftpOpens++;
    try {
      let f = 0;
      if ((flags & OPEN_MODE.READ) && (flags & OPEN_MODE.WRITE)) f = fsc.O_RDWR; else if (flags & OPEN_MODE.WRITE) f = fsc.O_WRONLY; else f = fsc.O_RDONLY;
      if (flags & OPEN_MODE.CREAT) f |= fsc.O_CREAT; if (flags & OPEN_MODE.TRUNC) f |= fsc.O_TRUNC; if (flags & OPEN_MODE.EXCL) f |= fsc.O_EXCL; if (flags & OPEN_MODE.APPEND) f |= fsc.O_APPEND;
      const fd = await fsp.open(path, f, 0o644);
      const id = next++; handles.set(id, { kind: "file", fd }); sftp.handle(reqid, handleBuf(id));
    } catch (e) { fail(reqid, e); }
  });
  sftp.on("READ", async (reqid, h, offset, length) => {
    const e = handles.get(idOf(h)); if (e?.kind !== "file") return sftp.status(reqid, STATUS_CODE.FAILURE);
    try { const buf = Buffer.alloc(length); const { bytesRead } = await e.fd.read(buf, 0, length, offset); if (bytesRead === 0) sftp.status(reqid, STATUS_CODE.EOF); else sftp.data(reqid, buf.subarray(0, bytesRead)); } catch (er) { fail(reqid, er); }
  });
  sftp.on("WRITE", async (reqid, h, offset, data) => {
    const e = handles.get(idOf(h)); if (e?.kind !== "file") return sftp.status(reqid, STATUS_CODE.FAILURE);
    try { await e.fd.write(data, 0, data.length, offset); ok(reqid); } catch (er) { fail(reqid, er); }
  });
  sftp.on("CLOSE", async (reqid, h) => { const e = handles.get(idOf(h)); handles.delete(idOf(h)); if (e?.kind === "file") await e.fd.close().catch(() => {}); ok(reqid); });
  sftp.on("OPENDIR", async (reqid, path) => { try { const entries = await fsp.readdir(path); const id = next++; handles.set(id, { kind: "dir", entries, path, done: false }); sftp.handle(reqid, handleBuf(id)); } catch (e) { fail(reqid, e); } });
  sftp.on("READDIR", async (reqid, h) => {
    const e = handles.get(idOf(h)); if (e?.kind !== "dir" || e.done) return sftp.status(reqid, STATUS_CODE.EOF);
    e.done = true;
    const names = await Promise.all(e.entries.map(async (n) => ({ filename: n, longname: n, attrs: attrsOf(await fsp.lstat(resolve(e.path, n))) as never })));
    sftp.name(reqid, names);
  });
  sftp.on("MKDIR", async (reqid, path) => { try { await fsp.mkdir(path); ok(reqid); } catch (e) { fail(reqid, e); } });
  sftp.on("REMOVE", async (reqid, path) => { try { await fsp.unlink(path); ok(reqid); } catch (e) { fail(reqid, e); } });
  sftp.on("RMDIR", async (reqid, path) => { try { await fsp.rmdir(path); ok(reqid); } catch (e) { fail(reqid, e); } });
  sftp.on("RENAME", async (reqid, a, b) => { try { await fsp.mkdir(dirname(b), { recursive: true }); await fsp.rename(a, b); ok(reqid); } catch (e) { fail(reqid, e); } });
  sftp.on("SETSTAT", (reqid) => ok(reqid)); sftp.on("FSETSTAT", (reqid) => ok(reqid));
  sftp.on("end", () => { for (const e of handles.values()) if (e.kind === "file") void e.fd.close().catch(() => {}); handles.clear(); });
}

export { netServer };
