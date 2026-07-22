-- CreateEnum
CREATE TYPE "PaymentFailureStatus" AS ENUM ('OPEN', 'RECOVERED', 'WRITTEN_OFF');

-- AlterTable
ALTER TABLE "PaymentFailure" ADD COLUMN     "recoveredAt" TIMESTAMP(3),
ADD COLUMN     "status" "PaymentFailureStatus" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "PaymentFailure_workspaceId_status_idx" ON "PaymentFailure"("workspaceId", "status");
