// A real OpenSSH sshd, run in user space on loopback for the live remote-workspace gate.
// Built by `just setup-openssh` (.tmp/openssh). Throwaway host/client keys, key auth only, no PAM.
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, connect } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

const PREFIX = join(import.meta.dir, "..", "..", ".tmp", "openssh", "prefix");
export const SSHD = join(PREFIX, "sbin", "sshd");
export const sshdAvailable = () => existsSync(SSHD);

export interface RealSshd {
  readonly port: number;
  readonly user: string;
  readonly fingerprint: string;
  readonly hostPublicLine: string;
  readonly clientKeyPem: string;
  readonly dir: string;
  readonly pid: number;
  /** Terminate every established session (the listener keeps running) — simulates a network drop. */
  dropSessions(): Promise<void>;
  stop(): Promise<void>;
}

const sh = async (cmd: string[]) => {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if ((await p.exited) !== 0) throw new Error(`${cmd.join(" ")} failed: ${err}`);
  return out;
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
    s.on("error", reject);
  });
}

export async function startRealSshd(): Promise<RealSshd> {
  if (!sshdAvailable()) throw new Error(`OpenSSH not built at ${SSHD}; run \`just setup-openssh\` (this gate FAILS, it does not skip, without it)`);
  const dir = await mkdtemp(join(tmpdir(), "cognate-sshd-"));
  const keygen = join(PREFIX, "bin", "ssh-keygen");
  await sh([keygen, "-q", "-t", "ed25519", "-N", "", "-f", join(dir, "hostkey")]);
  await sh([keygen, "-q", "-t", "ed25519", "-N", "", "-f", join(dir, "client")]);
  await writeFile(join(dir, "authorized_keys"), await readFile(join(dir, "client.pub"), "utf8"));
  const port = await freePort();
  await writeFile(join(dir, "sshd_config"), [
    `Port ${port}`, "ListenAddress 127.0.0.1", `HostKey ${join(dir, "hostkey")}`, `PidFile ${join(dir, "sshd.pid")}`,
    `AuthorizedKeysFile ${join(dir, "authorized_keys")}`, "PasswordAuthentication no", "KbdInteractiveAuthentication no", "UsePAM no",
    "StrictModes no", "AllowTcpForwarding yes", "PerSourcePenalties no", "MaxStartups 100:30:200", "LogLevel ERROR", `Subsystem sftp ${join(PREFIX, "libexec", "sftp-server")}`,
  ].join("\n") + "\n");
  const proc = Bun.spawn([SSHD, "-D", "-e", "-f", join(dir, "sshd_config")], { stdout: "ignore", stderr: "pipe" });
  const deadline = Date.now() + 10_000;
  for (;;) {
    // Ready = the SSH banner arrives. The kernel accepts TCP into the backlog (and later resets it)
    // before sshd is actually serving, so a bare connect() is not a readiness signal.
    const up = await new Promise<boolean>((r) => {
      const s = connect(port, "127.0.0.1");
      const done = (v: boolean) => { s.destroy(); r(v); };
      s.once("data", (d) => done(d.toString().startsWith("SSH-")));
      s.once("error", () => done(false));
      setTimeout(() => done(false), 1000);
    });
    if (up) break;
    if (Date.now() > deadline) { proc.kill(); throw new Error(`sshd did not start: ${await new Response(proc.stderr).text()}`); }
    await Bun.sleep(50);
  }
  const pub = (await readFile(join(dir, "hostkey.pub"), "utf8")).trim();
  const fp = (await sh([keygen, "-lf", join(dir, "hostkey.pub")])).match(/SHA256:\S+/)![0]!;
  return {
    port, user: userInfo().username, fingerprint: fp, hostPublicLine: pub, dir, pid: proc.pid,
    clientKeyPem: await readFile(join(dir, "client"), "utf8"),
    async dropSessions() {
      const kids = (await Bun.$`pgrep -P ${proc.pid}`.nothrow().text()).split("\n").filter(Boolean);
      for (const k of kids) await Bun.$`kill -9 ${k}`.nothrow().quiet();
    },
    async stop() { proc.kill(); await proc.exited; await rm(dir, { recursive: true, force: true }); },
  };
}
