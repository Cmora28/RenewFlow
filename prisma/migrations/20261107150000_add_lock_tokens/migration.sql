-- AlterTable
ALTER TABLE "RecoveryAction" ADD COLUMN "lockToken" TEXT;

-- AlterTable
ALTER TABLE "ProviderEvent" ADD COLUMN "lockToken" TEXT;
