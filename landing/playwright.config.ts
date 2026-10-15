import { defineConfig, devices } from '@playwright/test';

// The static build is served by scripts/serve.ts on a free port, started by globalSetup and stopped by globalTeardown.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4399', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
