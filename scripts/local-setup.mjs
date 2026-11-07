import fs from "node:fs";

import { envFilePath, generateLocalEnvText, validateLocalEnv, parseEnvFile, writeEnvFile } from "./local-lib.mjs";

const file = envFilePath();

if (fs.existsSync(file)) {
  const errors = validateLocalEnv(parseEnvFile(fs.readFileSync(file, "utf8")));
  if (errors.length > 0) {
    console.error("existing local env file failed validation");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("local env file already exists and passed validation");
  console.log("names: DATABASE_URL APP_URL NEXTAUTH_URL NEXTAUTH_SECRET CRON_SECRET");
  process.exit(0);
}

const generated = generateLocalEnvText();
writeEnvFile(file, generated.text);
const errors = validateLocalEnv(parseEnvFile(generated.text));
if (errors.length > 0) {
  console.error("generated local env file failed validation");
  process.exit(1);
}

console.log("wrote local env file");
console.log("generated names: NEXTAUTH_SECRET CRON_SECRET POSTGRES_PASSWORD DATABASE_URL");
console.log("stripe: unset");
console.log("resend: unset");
console.log("app origin: http://127.0.0.1:3010");
console.log("database: 127.0.0.1:54329/renewflow_local");
