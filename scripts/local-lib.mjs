import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
export const LOCAL_DB_PORT = "54329";
export const LOCAL_DB_NAME = "renewflow_local";
export const LOCAL_DB_USER = "renewflow_local";
export const LOCAL_APP_ORIGIN = "http://127.0.0.1:3010";

const TEST_KEY_PREFIXES = ["sk_test_", "rk_test_"];

export function envFilePath() {
  return process.env.RENEWFLOW_ENV_FILE
    ? path.resolve(process.env.RENEWFLOW_ENV_FILE)
    : path.resolve(process.cwd(), ".env.local");
}

export function parseEnvFile(contents) {
  const env = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function loadEnvFile(file = envFilePath()) {
  if (!fs.existsSync(file)) {
    return { file, env: null };
  }
  return { file, env: parseEnvFile(fs.readFileSync(file, "utf8")) };
}

/**
 * Local profile rules. Error strings name variables only; they never include
 * secret values, connection passwords, or key material.
 */
export function validateLocalEnv(env) {
  const errors = [];
  if (!env || typeof env !== "object") {
    return ["environment file is missing"];
  }

  const databaseUrl = env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    errors.push("DATABASE_URL is required");
  } else {
    let parsed;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.protocol !== "postgresql:") {
      errors.push("DATABASE_URL must be a postgresql URL");
    } else if (!LOCAL_DB_HOSTS.has(parsed.hostname)) {
      errors.push("DATABASE_URL host must be localhost or loopback");
    } else if (parsed.port !== LOCAL_DB_PORT) {
      errors.push(`DATABASE_URL port must be ${LOCAL_DB_PORT}`);
    } else if (parsed.pathname.replace(/^\//, "") !== LOCAL_DB_NAME) {
      errors.push(`DATABASE_URL database must be ${LOCAL_DB_NAME}`);
    }
  }

  for (const name of ["APP_URL", "NEXTAUTH_URL"]) {
    const value = env[name] ?? "";
    if (!isLocalHttpOrigin(value)) {
      errors.push(`${name} must be an http://localhost or http://127.0.0.1 origin`);
    }
  }
  if (
    env.APP_URL &&
    env.NEXTAUTH_URL &&
    isLocalHttpOrigin(env.APP_URL) &&
    isLocalHttpOrigin(env.NEXTAUTH_URL) &&
    new URL(env.APP_URL).origin !== new URL(env.NEXTAUTH_URL).origin
  ) {
    errors.push("APP_URL and NEXTAUTH_URL must share the same origin");
  }

  if (!env.NEXTAUTH_SECRET) errors.push("NEXTAUTH_SECRET is required");
  if (!env.CRON_SECRET) errors.push("CRON_SECRET is required");

  if (env.RESEND_API_KEY) {
    errors.push("RESEND_API_KEY must stay unset in the local profile");
  }

  const stripeKey = env.STRIPE_SECRET_KEY ?? "";
  if (stripeKey && !TEST_KEY_PREFIXES.some((prefix) => stripeKey.startsWith(prefix))) {
    errors.push("STRIPE_SECRET_KEY must start with sk_test_ or rk_test_");
  }

  if (env.NODE_ENV === "production") {
    errors.push("NODE_ENV=production is refused for the local profile");
  }

  return errors;
}

export function isLocalHttpOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      LOCAL_DB_HOSTS.has(url.hostname) &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

export function generateLocalEnvText() {
  const password = randomBytes(24).toString("base64url");
  const nextAuthSecret = randomBytes(32).toString("base64url");
  const cronSecret = randomBytes(32).toString("base64url");
  const databaseUrl = `postgresql://${LOCAL_DB_USER}:${encodeURIComponent(password)}@127.0.0.1:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}?schema=public`;
  const text = [
    "# Generated local profile. Gitignored. Do not point this at a shared or production database.",
    "# RESEND_API_KEY is omitted on purpose: recovery mail stays on the console.",
    "# Stripe values stay empty until a test key and test webhook secret are supplied out of band.",
    `POSTGRES_USER=${LOCAL_DB_USER}`,
    `POSTGRES_PASSWORD=${password}`,
    `POSTGRES_DB=${LOCAL_DB_NAME}`,
    `DATABASE_URL=${databaseUrl}`,
    `APP_URL=${LOCAL_APP_ORIGIN}`,
    `NEXTAUTH_URL=${LOCAL_APP_ORIGIN}`,
    `NEXTAUTH_SECRET=${nextAuthSecret}`,
    `CRON_SECRET=${cronSecret}`,
    "NEXT_PUBLIC_APP_NAME=RenewFlow",
    "STRIPE_SECRET_KEY=",
    "STRIPE_WEBHOOK_SECRET=",
    "STRIPE_CLIENT_ID=",
    "",
  ].join("\n");
  return { text, password, nextAuthSecret, cronSecret };
}

export function writeEnvFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

export function assertSafeDataDir(dir) {
  const resolved = path.resolve(dir);
  const localRoot = path.resolve(process.cwd(), ".local");
  const tempRoot = path.resolve("/tmp");
  const inside = (root) => resolved === root || resolved.startsWith(root + path.sep);
  if (!inside(localRoot) && !inside(tempRoot)) {
    throw new Error("Refusing Postgres data directory outside .local or /tmp");
  }
  return resolved;
}

export function dataDirPath() {
  return assertSafeDataDir(
    process.env.RENEWFLOW_PGDATA
      ? path.resolve(process.env.RENEWFLOW_PGDATA)
      : path.resolve(process.cwd(), ".local/pgdata"),
  );
}
