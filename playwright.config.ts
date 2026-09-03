import { defineConfig, devices } from "@playwright/test";
import { defaultVisualTestSecret, visualTestHeader } from "./lib/visual-test-mode";

const port = Number(process.env.PORT || process.env.DEALEROS_VISUAL_PORT || 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const visualSecret = process.env.DEALEROS_VISUAL_TEST_SECRET || defaultVisualTestSecret;

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./design-references/failures",
  snapshotPathTemplate: "{testDir}/../../design-references/approved/{testFilePath}/{arg}{ext}",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "design-references/report", open: "never" }]],
  use: {
    baseURL,
    extraHTTPHeaders: { [visualTestHeader]: visualSecret },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `node scripts/start-visual-dev.mjs --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.012,
      animations: "disabled",
      caret: "hide",
    },
  },
});
