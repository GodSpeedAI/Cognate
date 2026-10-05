// Live gate for the SSH and WSL execution-world providers. Builds the user-space OpenSSH if needed,
// then runs tests/live/remote-workspaces.live.ts (providers) and
// tests/live/remote-workspaces-harness.live.ts (the full app) against a real sshd and a real WSL distribution.
//   bun scripts/remote-workspaces-live.ts
// Environment (all optional): COGNATE_WSL_DISTRO, and COGNATE_SSH_HOST/USER/KEY/PORT/ROOT to run the
// same suite against your own host (host key from ~/.ssh/known_hosts).
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
if (!existsSync(join(root, ".tmp", "openssh", "prefix", "sbin", "sshd"))) {
  const build = Bun.spawn(["bun", join(import.meta.dir, "setup-openssh.ts")], { stdout: "inherit", stderr: "inherit" });
  if ((await build.exited) !== 0) process.exit(1);
}
const test = Bun.spawn(["bun", "test", "--timeout", "90000", join(root, "tests", "live", "remote-workspaces.live.ts"), join(root, "tests", "live", "remote-workspaces-harness.live.ts")], { cwd: root, stdout: "inherit", stderr: "inherit", env: process.env });
process.exit(await test.exited);
