-- Keys issued before this upgrade keep keyPrefix NULL and use the legacy lookup.
-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "keyPrefix" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyPrefix_key" ON "ApiKey"("keyPrefix");
