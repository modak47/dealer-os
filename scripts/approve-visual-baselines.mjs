import { spawnSync } from "node:child_process";

if (process.env.CONFIRM_VISUAL_BASELINE_UPDATE !== "1") {
  console.error("Refusing to update approved screenshots without CONFIRM_VISUAL_BASELINE_UPDATE=1.");
  console.error("Review candidate and failure images first, then rerun with the confirmation env var set.");
  process.exit(1);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "test", "--update-snapshots", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DEALEROS_VISUAL_TEST_MODE: "1" },
});

process.exit(result.status ?? 1);
