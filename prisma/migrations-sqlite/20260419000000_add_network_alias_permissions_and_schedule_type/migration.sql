-- AlterTable: add manageNetworkAliasesEnabled to GlobalSettings
ALTER TABLE "GlobalSettings" ADD COLUMN "manageNetworkAliasesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add targetAliasNames to ScheduleExecution
ALTER TABLE "ScheduleExecution" ADD COLUMN "targetAliasNames" JSONB;
