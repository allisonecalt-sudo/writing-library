import { defineConfig, devices } from '@playwright/test';

// Unusual port on purpose: a stale `serve` from another app once ran a whole suite against the
// wrong build (budget-2026, 2026-09-24). Override with WL_TEST_PORT if this one is taken.
const PORT = Number(process.env.WL_TEST_PORT) || 4871;

export default defineConfig({
  testDir: './tests',
  // test-results/screens holds the screenshots; keep Playwright's own artifacts out of it.
  outputDir: 'test-results/output',
  workers: 1,
  retries: 0,
  // Nothing may wait forever: a stuck test fails fast instead of hanging CI.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  globalTimeout: 8 * 60_000,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Block service workers so every Supabase request goes through the in-test mock.
    serviceWorkers: 'block',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    viewport: { width: 412, height: 892 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 412, height: 892 } },
    },
  ],
  webServer: {
    command: `npx serve -l tcp://0.0.0.0:${PORT} .`,
    url: `http://127.0.0.1:${PORT}/manifest.webmanifest`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
