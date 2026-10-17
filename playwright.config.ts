import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
// E2E_PROD=1 runs against a production build (minified bundles, real prerendering).
const PROD = process.env.E2E_PROD === "1";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: PROD
      ? `pnpm exec next build && pnpm exec next start -p ${PORT}`
      : `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/methodology`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI && !PROD,
    env: {
      ABT_FIXTURES: "1",
      ABT_E2E: "1",
      PGLITE_DIR: "memory://",
      GITHUB_MODE: "mock",
      MOCK_SCORE_MS: "3000",
      APP_URL: `http://localhost:${PORT}`,
      NEXT_TELEMETRY_DISABLED: "1",
      // Unlock the human leaderboard after one scored attempt so e2e covers both states.
      ABT_HUMAN_MIN_ATTEMPTS: "1",
      ABT_STATS_TTL_MS: "0",
      ...(PROD ? { NEXT_DIST_DIR: ".next-e2e" } : {}),
    },
  },
});
