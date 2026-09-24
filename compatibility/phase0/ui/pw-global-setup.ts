import { spawn, type ChildProcess } from "node:child_process";

// Playwright's built-in `webServer` option probes readiness with a raw TCP
// connect to the port before spawning the command. In this sandbox's WSL2
// network stack, connecting to an *unbound* loopback port does not fail
// fast with ECONNREFUSED -- it hangs until an OS-level timeout, so the
// probe (and the whole `playwright test` invocation) hangs indefinitely
// before the server is ever spawned. See API_NOTES.md.
//
// Workaround: spawn the Bun server ourselves and treat its own stdout
// "listening on" line as the readiness signal, never polling the socket.
let child: ChildProcess | undefined;

export default async function globalSetup() {
  child = spawn("bun", ["run", "playwright-server.tsx"], {
    cwd: import.meta.dirname,
    stdio: ["ignore", "pipe", "inherit"],
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("bun server did not report ready in time")), 15_000);
    child!.stdout!.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child!.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`bun server exited early with code ${code}`));
    });
  });

  return async () => {
    child?.kill();
  };
}
