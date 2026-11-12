import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the PRD "ready when" flows. They run against a dedicated,
 * freshly migrated and seeded database (cyon_e2e) and a dev server on port 3100.
 */
const PORT = 3100;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54329/cyon_e2e";
export const E2E_MEMBER_DEFAULT_PASSWORD = "Welcome-2026";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      DIRECT_URL: E2E_DATABASE_URL,
      APP_URL: `http://localhost:${PORT}`,
      MEMBER_DEFAULT_PASSWORD: E2E_MEMBER_DEFAULT_PASSWORD,
      // Own build folder, so the tests can run while `next dev` is running.
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
