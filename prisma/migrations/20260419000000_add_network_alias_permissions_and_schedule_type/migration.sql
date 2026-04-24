-- AlterEnum
ALTER TYPE "ScheduleTargetType" ADD VALUE 'NETWORK_ALIAS';

-- AlterTable
ALTER TABLE "GlobalSettings" ADD COLUMN     "manageNetworkAliasesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ScheduleExecution" ADD COLUMN     "targetAliasNames" JSONB;
