import { spawnSync } from "node:child_process";

import { loadEnvFile, validateLocalEnv } from "./local-lib.mjs";

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

const child = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, ...env, NODE_ENV: "development" },
});
process.exit(child.status ?? 1);
