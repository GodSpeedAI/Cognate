import { defineConfig } from "@playwright/test";

// Playwright workers run under Node; the app is a separate Bun process started by global-setup (DEBT-012).
export default defineConfig({
  testDir: ".",
  testMatch: "journey.e2e.ts",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  globalSetup: "./global-setup.ts",
  use: { headless: true, baseURL: `http://127.0.0.1:${process.env.COGNATE_E2E_PORT ?? "43917"}` },
});
