import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = 3_107;
const baseURL = `http://127.0.0.1:${port}`;
const databasePath = path.resolve(import.meta.dirname, "test-results/e2e/quanzhan.db");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: {
      ...process.env,
      AI_PROVIDER: "mock",
      DB_PATH: databasePath,
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
