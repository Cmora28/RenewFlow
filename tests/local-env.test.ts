import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  generateLocalEnvText,
  parseEnvFile,
  validateLocalEnv,
} from "../scripts/local-lib.mjs";

describe("local profile validation", () => {
  it("accepts a generated file and rejects remote, live, and resend settings", () => {
    const generated = generateLocalEnvText();
    const env = parseEnvFile(generated.text);
    expect(validateLocalEnv(env)).toEqual([]);

    expect(
      validateLocalEnv({
        ...env,
        DATABASE_URL: "postgresql://renewflow_local:secret@db.internal:5432/renewflow",
      }).some((error) => error.includes("loopback")),
    ).toBe(true);

    expect(
      validateLocalEnv({
        ...env,
        DATABASE_URL:
          "postgresql://renewflow_local:secret@127.0.0.1:5432/renewflow_test",
      }).some((error) => error.includes("54329")),
    ).toBe(true);

    expect(
      validateLocalEnv({
        ...env,
        APP_URL: "https://renewflow.example",
        NEXTAUTH_URL: "https://renewflow.example",
      }).some((error) => error.startsWith("APP_URL")),
    ).toBe(true);

    const live = validateLocalEnv({
      ...env,
      STRIPE_SECRET_KEY: "sk_live_example_value",
    });
    expect(live).toContain("STRIPE_SECRET_KEY must start with sk_test_ or rk_test_");
    expect(live.join("\n")).not.toContain("sk_live_example_value");

    expect(
      validateLocalEnv({ ...env, STRIPE_SECRET_KEY: "sk_test_placeholder" }),
    ).toEqual([]);
    expect(
      validateLocalEnv({ ...env, RESEND_API_KEY: "re_example" }).some((error) =>
        error.includes("RESEND_API_KEY"),
      ),
    ).toBe(true);
    expect(validateLocalEnv({ ...env, NODE_ENV: "production" })).toContain(
      "NODE_ENV=production is refused for the local profile",
    );
  });

  it("writes a local env file without printing generated secrets", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "renewflow-local-"));
    const file = path.join(dir, "env.local");
    const result = spawnSync(process.execPath, ["scripts/local-setup.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, RENEWFLOW_ENV_FILE: file },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const written = fs.readFileSync(file, "utf8");
    const env = parseEnvFile(written) as Record<string, string>;
    expect(result.stdout.includes(env.NEXTAUTH_SECRET)).toBe(false);
    expect(result.stdout.includes(env.CRON_SECRET)).toBe(false);
    expect(result.stdout.includes(env.POSTGRES_PASSWORD)).toBe(false);
    expect(result.stderr.includes(env.NEXTAUTH_SECRET)).toBe(false);
    expect(written.includes("RESEND_API_KEY=")).toBe(false);
    expect(written.includes("acct_")).toBe(false);
    expect(validateLocalEnv(env)).toEqual([]);
    const mode = fs.statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("keeps the compose file on loopback 54329 and free of account ids", () => {
    const compose = fs.readFileSync("docker-compose.local.yml", "utf8");
    expect(compose).toContain("127.0.0.1:54329:5432");
    expect(compose).toContain("renewflow_local");
    expect(compose).not.toContain("acct_");
    expect(compose).not.toContain("sk_live_");
    expect(compose).not.toContain("sk_test_");
  });
});
