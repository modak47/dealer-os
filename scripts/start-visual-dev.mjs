import { spawn } from "node:child_process";
import net from "node:net";

const args = process.argv.slice(2);
const portArg = args[args.indexOf("--port") + 1];
const port = Number(portArg || process.env.DEALEROS_VISUAL_PORT || process.env.PORT || 3100);
const host = process.env.DEALEROS_VISUAL_HOST || "127.0.0.1";

async function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

if (await isPortOpen()) {
  console.log(`DealerOS visual dev server already available at http://${host}:${port}`);
  process.exit(0);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
console.log(`Starting DealerOS visual dev server at http://${host}:${port}`);
const child = spawn(npm, ["run", "dev", "--", "-H", host, "-p", String(port)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NODE_ENV: "development",
    DEALEROS_VISUAL_TEST_MODE: "1",
    DEALEROS_VISUAL_TEST_SECRET: process.env.DEALEROS_VISUAL_TEST_SECRET || "dealeros-visual-dev",
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || `http://${host}:${port}`,
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
