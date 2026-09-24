import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Spawns the Bun app and waits for its "listening" line instead of probing the socket (DEBT-012).
export default async function globalSetup() {
  const dir = mkdtempSync(join(tmpdir(), "cognate-e2e-"));
  process.env.COGNATE_E2E_DB = join(dir, "app.sqlite");
  process.env.COGNATE_E2E_DIR = dir;
  const port = process.env.COGNATE_E2E_PORT ?? "43917";
  const child: ChildProcess = spawn("bun", ["run", "app.ts"], {
    cwd: import.meta.dirname,
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, PORT: port, COGNATE_E2E_DB: process.env.COGNATE_E2E_DB, COGNATE_E2E_DIR: dir },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("e2e app did not report ready")), 60_000);
    child.stdout!.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`e2e app exited early with code ${code}`));
    });
  });
  return async () => {
    child.kill();
  };
}
