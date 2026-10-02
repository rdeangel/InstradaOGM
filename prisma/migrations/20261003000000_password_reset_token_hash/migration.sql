-- Reset links issued before this upgrade cannot be verified and are invalidated.
-- Users mid-reset must request a new link.
UPDATE "User" SET "passwordResetExpires" = NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "passwordResetToken",
ADD COLUMN "passwordResetTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetTokenHash_key" ON "User"("passwordResetTokenHash");
