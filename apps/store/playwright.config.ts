import { defineConfig } from "@playwright/test";

export const API_URL = "http://localhost:3000/api/v1";
const STORE_URL = "http://localhost:3001";

/**
 * Real-browser smoke tests for the Web Store (`pnpm --filter @kiranabar/store
 * test:browser`). They exist because every other test runs in Node, and two
 * bugs only ever showed up in a real browser: the client bundle crashing on
 * load, and the cart rendering empty on a full page load.
 *
 * Runs the store's *dev* server -- that's where the client-bundle crash
 * happened (Vite serving the CommonJS workspace packages untransformed).
 */
export default defineConfig({
  testDir: "./e2e",
  // One API + database underneath: run serially.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: STORE_URL,
    // The installed Google Chrome (on GitHub's ubuntu-latest runners too), so
    // no separate browser download is needed.
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      // Needs a built API (`pnpm --filter @kiranabar/api build`) and a
      // migrated, seeded database: the tests sign in as the seeded admin.
      command: "pnpm --filter @kiranabar/api start",
      cwd: "../..",
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm dev",
      url: STORE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
