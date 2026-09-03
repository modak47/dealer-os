import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DEALEROS_VISUAL_TEST_MODE: "1", VISUAL_CANDIDATE_SCREENSHOTS: "1" },
});

process.exit(result.status ?? 1);
