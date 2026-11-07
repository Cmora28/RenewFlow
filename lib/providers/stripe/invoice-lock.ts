import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type InvoiceTx = Prisma.TransactionClient;

let afterInvoiceLockForTests: (() => Promise<void>) | undefined;
let afterInvoiceUpsertForTests: (() => Promise<void>) | undefined;

/** Test-only barrier. Runs inside the transaction after the invoice lock. */
export function setAfterInvoiceLockForTests(
  hook: (() => Promise<void>) | undefined,
): void {
  afterInvoiceLockForTests = hook;
}

/** Test-only failure point after the invoice row write and before case writes. */
export function setAfterInvoiceUpsertForTests(
  hook: (() => Promise<void>) | undefined,
): void {
  afterInvoiceUpsertForTests = hook;
}

export async function notifyInvoiceUpsertForTests(): Promise<void> {
  if (afterInvoiceUpsertForTests) {
    await afterInvoiceUpsertForTests();
  }
}

/**
 * Serialize every mutation for one provider invoice.
 * `pg_advisory_xact_lock` is held until the transaction commits or rolls back,
 * including the gap before the invoice row exists. Event timestamps are not
 * used: a newer stale payload cannot pass a committed PAID row.
 */
export async function withInvoiceMutation<T>(
  workspaceId: string,
  providerInvoiceId: string,
  fn: (tx: InvoiceTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}), hashtext(${providerInvoiceId}))`;
      if (afterInvoiceLockForTests) {
        await afterInvoiceLockForTests();
      }
      return fn(tx);
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
}
