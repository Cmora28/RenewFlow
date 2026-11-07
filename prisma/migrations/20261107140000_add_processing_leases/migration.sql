-- AlterTable
ALTER TABLE "RecoveryAction" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RecoveryAction" ADD COLUMN "lockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProviderEvent" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProviderEvent" ADD COLUMN "lockedAt" TIMESTAMP(3);
