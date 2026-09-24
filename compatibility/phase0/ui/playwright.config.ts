import { defineConfig } from "@playwright/test";

// Playwright's test runner executes under Node (not Bun -- `Bun` is
// undefined inside a Playwright worker process, see API_NOTES.md). The
// page under test is instead served by a real `bun run` child process.
//
// NOTE: Playwright's built-in `webServer` option was tried first and
// hangs indefinitely in this sandbox (its readiness probe is a raw TCP
// connect to the port, which never fails fast here -- see
// pw-global-setup.ts and API_NOTES.md for the full explanation). This
// config uses a hand-rolled globalSetup/globalTeardown instead, which
// waits on the child process's own stdout rather than probing the socket.
export default defineConfig({
  testDir: ".",
  testMatch: "hydration.spec.ts",
  timeout: 30_000,
  reporter: "list",
  globalSetup: "./pw-global-setup.ts",
  use: {
    headless: true,
    baseURL: "http://localhost:3311",
  },
});
