import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalSetup(): void {
  process.env.DATABASE_URL ??=
    "postgresql://renewflow:renewflow@127.0.0.1:5432/renewflow_test";
  execFileSync(path.resolve("node_modules/.bin/prisma"), ["migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
}
