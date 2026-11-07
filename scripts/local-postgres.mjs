import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  LOCAL_DB_PORT,
  LOCAL_DB_USER,
  assertSafeDataDir,
  dataDirPath,
  loadEnvFile,
  validateLocalEnv,
} from "./local-lib.mjs";

const command = process.argv[2] ?? "up";
const dataDir = dataDirPath();
const socketDir = assertSafeDataDir(path.join(path.dirname(dataDir), "pg-run"));
const marker = path.join(dataDir, "RENEWFLOW_LOCAL");
const binDir = "/usr/lib/postgresql/16/bin";

function binary(name) {
  const candidate = path.join(binDir, name);
  return fs.existsSync(candidate) ? candidate : name;
}

function readPassword() {
  const { env } = loadEnvFile();
  if (!env) {
    console.error("local env file is missing; run npm run local:setup");
    process.exit(1);
  }
  const errors = validateLocalEnv(env);
  if (errors.length > 0) {
    console.error("local profile rejected");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  if (!env.POSTGRES_PASSWORD || env.POSTGRES_USER !== LOCAL_DB_USER) {
    console.error("POSTGRES_USER must be renewflow_local and POSTGRES_PASSWORD is required");
    process.exit(1);
  }
  return env.POSTGRES_PASSWORD;
}

function pgCtl(args) {
  execFileSync(binary("pg_ctl"), args, { stdio: "inherit" });
}

function isRunning() {
  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) return false;
  try {
    execFileSync(binary("pg_ctl"), ["status", "-D", dataDir], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function assertOwnedDataDir() {
  if (!fs.existsSync(dataDir)) return;
  if (!fs.existsSync(marker)) {
    console.error("Refusing to touch a Postgres directory that is not marked renewflow-local");
    process.exit(1);
  }
}

if (command === "down") {
  assertOwnedDataDir();
  if (!fs.existsSync(dataDir)) {
    console.log("local database is not initialized");
    process.exit(0);
  }
  if (isRunning()) {
    pgCtl(["stop", "-D", dataDir, "-m", "fast"]);
  }
  console.log("stopped local database on 127.0.0.1:" + LOCAL_DB_PORT);
  process.exit(0);
}

if (command !== "up") {
  console.error("usage: node scripts/local-postgres.mjs up|down");
  process.exit(1);
}

const password = readPassword();
assertOwnedDataDir();
fs.mkdirSync(socketDir, { recursive: true });

if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
  const passwordFile = path.join(path.dirname(dataDir), "pwfile");
  fs.mkdirSync(path.dirname(passwordFile), { recursive: true });
  fs.writeFileSync(passwordFile, password + "\n", { mode: 0o600 });
  try {
    execFileSync(
      binary("initdb"),
      [
        "-D",
        dataDir,
        "--username",
        LOCAL_DB_USER,
        "--pwfile",
        passwordFile,
        "--auth-local=scram-sha-256",
        "--auth-host=scram-sha-256",
        "--encoding=UTF8",
        "--locale=C",
      ],
      { stdio: "inherit" },
    );
    fs.writeFileSync(marker, "renewflow-local\n", { mode: 0o600 });
  } finally {
    fs.rmSync(passwordFile, { force: true });
  }
}

if (!isRunning()) {
  pgCtl([
    "start",
    "-D",
    dataDir,
    "-l",
    path.join(path.dirname(dataDir), "postgres.log"),
    "-o",
    `-c listen_addresses=127.0.0.1 -c port=${LOCAL_DB_PORT} -c unix_socket_directories=${socketDir}`,
  ]);
}

console.log("local database ready on 127.0.0.1:" + LOCAL_DB_PORT + "/" + "renewflow_local");
