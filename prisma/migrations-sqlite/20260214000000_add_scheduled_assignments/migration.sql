-- CreateTable
CREATE TABLE "ScheduledAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduleType" TEXT NOT NULL DEFAULT 'COMPLEX_WEEKLY',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "executeAt" DATETIME,
    "cronExpression" TEXT,
    "targetType" TEXT NOT NULL,
    "targetSelector" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastExecutedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ScheduleDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    CONSTRAINT "ScheduleDay_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduledAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleDayId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT,
    CONSTRAINT "TimeWindow_scheduleDayId_fkey" FOREIGN KEY ("scheduleDayId") REFERENCES "ScheduleDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operation" TEXT NOT NULL,
    "boundaryType" TEXT NOT NULL,
    "targetGroupUuid" TEXT,
    "fromGroupUuid" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "timeWindowId" TEXT,
    "onceScheduleId" TEXT,
    "recurringScheduleId" TEXT,
    CONSTRAINT "ScheduleAction_timeWindowId_fkey" FOREIGN KEY ("timeWindowId") REFERENCES "TimeWindow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleAction_onceScheduleId_fkey" FOREIGN KEY ("onceScheduleId") REFERENCES "ScheduledAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleAction_recurringScheduleId_fkey" FOREIGN KEY ("recurringScheduleId") REFERENCES "ScheduledAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "boundaryType" TEXT NOT NULL,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "targetIps" JSONB NOT NULL,
    "actionsRun" JSONB NOT NULL,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    CONSTRAINT "ScheduleExecution_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduledAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OpnsenseGroupDisplay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opnsenseUuid" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "iconIdentifier" TEXT,
    "groupType" TEXT NOT NULL DEFAULT 'SingleSelect',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_OpnsenseGroupDisplay" ("createdAt", "friendlyName", "groupType", "iconIdentifier", "id", "opnsenseUuid", "updatedAt") SELECT "createdAt", "friendlyName", "groupType", "iconIdentifier", "id", "opnsenseUuid", "updatedAt" FROM "OpnsenseGroupDisplay";
DROP TABLE "OpnsenseGroupDisplay";
ALTER TABLE "new_OpnsenseGroupDisplay" RENAME TO "OpnsenseGroupDisplay";
CREATE UNIQUE INDEX "OpnsenseGroupDisplay_opnsenseUuid_key" ON "OpnsenseGroupDisplay"("opnsenseUuid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ScheduledAssignment_enabled_scheduleType_idx" ON "ScheduledAssignment"("enabled", "scheduleType");

-- CreateIndex
CREATE INDEX "ScheduledAssignment_priority_idx" ON "ScheduledAssignment"("priority");

-- CreateIndex
CREATE INDEX "ScheduleDay_scheduleId_dayOfWeek_idx" ON "ScheduleDay"("scheduleId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDay_scheduleId_dayOfWeek_key" ON "ScheduleDay"("scheduleId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ScheduleAction_timeWindowId_boundaryType_sortOrder_idx" ON "ScheduleAction"("timeWindowId", "boundaryType", "sortOrder");

-- CreateIndex
CREATE INDEX "ScheduleExecution_scheduleId_executedAt_idx" ON "ScheduleExecution"("scheduleId", "executedAt");

-- CreateIndex
CREATE INDEX "ScheduleExecution_executedAt_idx" ON "ScheduleExecution"("executedAt");

-- CreateIndex
CREATE INDEX "ScheduleExecution_status_idx" ON "ScheduleExecution"("status");

-- RedefineIndex
DROP INDEX "new_Group_name_key";
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- RedefineIndex
DROP INDEX "new_User_email_key";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- RedefineIndex
DROP INDEX "new_User_username_key";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

