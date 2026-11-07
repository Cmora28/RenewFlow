import { loadEnvFile, validateLocalEnv } from "./local-lib.mjs";

const { file, env } = loadEnvFile();
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

const stripe = env.STRIPE_SECRET_KEY ? "test-prefix" : "unset";
console.log("local profile ok");
console.log(`file: ${file}`);
console.log("stripe key: " + stripe);
console.log("resend: unset");
console.log("live stripe events: rejected by application code");
console.log("database: 127.0.0.1:54329/renewflow_local");
