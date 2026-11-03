import { defineConfig } from "@playwright/test";
import dealerOsConfig from "./playwright.config";

const baseURL = (process.env.MOTORGEEKS_VISUAL_URL || "http://127.0.0.1:3102").replace(/\/$/, "");
process.env.MOTORGEEKS_VISUAL_URL = baseURL;
const local = ["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname);

export default defineConfig({
  ...dealerOsConfig,
  testMatch: /motorgeeks-(home|brands|site|valuation)\.visual\.spec\.ts/,
  use: { ...dealerOsConfig.use, baseURL },
  outputDir: "./design-references/failures/motorgeeks-home",
  reporter: [["list"], ["html", { outputFolder: "design-references/report/motorgeeks-home", open: "never" }]],
  webServer: local ? {
    command: `npm --prefix apps/motorleads run dev -- -H 127.0.0.1 -p ${new URL(baseURL).port || "3102"}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  } : undefined,
});
