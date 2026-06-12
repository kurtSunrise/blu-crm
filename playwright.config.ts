import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "./output/playwright/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["html", { outputFolder: "output/playwright/report", open: "never" }],
    ["list"],
  ],
  use: {
    baseURL,
    // Session created in e2e/global-setup.ts; the (app) shell requires it.
    storageState: "output/playwright/.auth/team.json",
    trace: "on-first-retry",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "tablet", use: { ...devices["iPad Pro 11"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      // Deterministic Anthropic stand-in for the AI assistant specs.
      command: "npx tsx e2e/mock-anthropic-server.ts",
      url: "http://127.0.0.1:4848/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      // Cold Turbopack compiles on slow filesystems blow the 60s default.
      timeout: 240_000,
      env: {
        ANTHROPIC_API_KEY: "mock-key-for-e2e",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:4848",
      },
    },
  ],
});
