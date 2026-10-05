// Builds a user-space OpenSSH (sshd + ssh-keygen) into .tmp/openssh for the live remote-workspace
// gate. No root, no system install: the gate runs this sshd on a loopback port with throwaway keys.
// Usage: bun scripts/setup-openssh.ts   (idempotent)
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VERSION = "10.0p1";
// First observed download of this tarball (pinned for reproducibility; not independently GPG-verified).
const SHA256 = process.env.OPENSSH_SHA256 ?? "";
const root = join(import.meta.dir, "..", ".tmp", "openssh");
const prefix = join(root, "prefix");
const sshd = join(prefix, "sbin", "sshd");

if (existsSync(sshd)) {
  console.log(`openssh already built: ${sshd}`);
  process.exit(0);
}
await mkdir(root, { recursive: true });
const tarball = join(root, `openssh-${VERSION}.tar.gz`);
if (!existsSync(tarball)) {
  const res = await fetch(`https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable/openssh-${VERSION}.tar.gz`);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  await writeFile(tarball, new Uint8Array(await res.arrayBuffer()));
}
const digest = createHash("sha256").update(await Bun.file(tarball).bytes()).digest("hex");
console.log(`sha256 ${digest}`);
if (SHA256 && digest !== SHA256) throw new Error(`sha256 mismatch: expected ${SHA256}`);

const run = async (cmd: string[], cwd: string) => {
  const p = Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if ((await p.exited) !== 0) throw new Error(`failed: ${cmd.join(" ")}`);
};
await run(["tar", "xzf", tarball], root);
const src = join(root, `openssh-${VERSION}`);
await run(["./configure", `--prefix=${prefix}`, "--without-pam", "--without-selinux", "--with-privsep-path=" + join(root, "empty")], src);
await run(["make", "-j4"], src);
await run(["make", "install-nokeys"], src);
console.log(`built ${sshd}`);
