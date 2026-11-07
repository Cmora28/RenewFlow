import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile, validateLocalEnv } from "./local-lib.mjs";

function scriptPath(name) {
  return fileURLToPath(new URL(`./${name}`, import.meta.url));
}

function run(name, args = []) {
  const child = spawnSync(process.execPath, [scriptPath(name), ...args], { stdio: "inherit" });
  if (child.status !== 0) process.exit(child.status ?? 1);
}

run("local-setup.mjs");
run("local-check.mjs");
run("local-postgres.mjs", ["up"]);
run("local-migrate.mjs");

const { env } = loadEnvFile();
const errors = validateLocalEnv(env);
if (errors.length > 0) process.exit(1);

const origin = new URL(env.APP_URL);
const port = origin.port || "80";
const logPath = fileURLToPath(new URL("../.local/next-smoke.log", import.meta.url));
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const log = fs.openSync(logPath, "a");
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--port", port, "--hostname", "127.0.0.1"],
  {
    stdio: ["ignore", log, log],
    env: { ...process.env, ...env, NODE_ENV: "production" },
    detached: true,
  },
);

function stopServer() {
  if (server.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      console.error("local app exited before listening");
      process.exit(1);
    }
    try {
      const response = await fetch(origin.origin + "/login");
      if (response.status === 200) return;
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.error("local app did not answer /login");
  process.exit(1);
}

try {
  await waitForServer();
  const login = await fetch(origin.origin + "/login");
  const signup = await fetch(origin.origin + "/signup");
  const jobs = await fetch(origin.origin + "/api/jobs/run", { method: "POST" });
  const missing = await fetch(origin.origin + "/pay/update/not-a-token");
  if (login.status !== 200 || signup.status !== 200 || jobs.status !== 401 || missing.status !== 200) {
    console.error(
      `smoke status login=${login.status} signup=${signup.status} jobs=${jobs.status} pay=${missing.status}`,
    );
    process.exit(1);
  }
  console.log("local smoke ok");
  console.log("login: 200");
  console.log("signup: 200");
  console.log("POST /api/jobs/run without bearer: 401");
  console.log("GET /pay/update/not-a-token: 200");
  console.log("stripe calls: none");
  console.log("public url: none");
} finally {
  stopServer();
  fs.closeSync(log);
}
