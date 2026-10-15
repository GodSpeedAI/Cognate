import { defineConfig, devices } from '@playwright/test';

// e2e runs against the static build served by `astro preview`. `bun run test:e2e` builds first.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4322', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: "sh -c 'node_modules/.bin/astro preview --port 4322 --host 127.0.0.1 & wait'",
    url: 'http://127.0.0.1:4322/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
