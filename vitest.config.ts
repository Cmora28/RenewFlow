import path from "node:path";

import { defineConfig } from "vitest/config";

process.env.DATABASE_URL ??=
  "postgresql://renewflow:renewflow@127.0.0.1:5432/renewflow_test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_ci_placeholder";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_ci_placeholder";
process.env.CRON_SECRET ??= "ci-cron-secret";
process.env.NEXTAUTH_SECRET ??= "ci-nextauth-secret";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.APP_URL ??= "http://localhost:3000";
delete process.env.RESEND_API_KEY;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
