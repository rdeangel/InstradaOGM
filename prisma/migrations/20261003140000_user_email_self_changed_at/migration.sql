-- Set by PUT /api/account/update-profile on a self email change. NULL for every existing row (no backfill).
-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailSelfChangedAt" TIMESTAMP(3);
