import { defineConfig, devices } from "@playwright/test"

const baseURL = "http://localhost:3000"

export default defineConfig({
  testDir: "e2e",
  // The suite shares one seeded organization and mutates its requests, so the
  // specs run serially against a single server.
  // ponytail: bump workers once each spec seeds its own org.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
