-- SQLite does not support enums — stored as TEXT with CHECK constraints

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
    "targetSelector" TEXT NOT NULL,
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
    "targetIps" TEXT NOT NULL,
    "actionsRun" TEXT NOT NULL,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    CONSTRAINT "ScheduleExecution_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduledAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScheduledAssignment_enabled_scheduleType_idx" ON "ScheduledAssignment"("enabled", "scheduleType");

-- CreateIndex
CREATE INDEX "ScheduledAssignment_priority_idx" ON "ScheduledAssignment"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDay_scheduleId_dayOfWeek_key" ON "ScheduleDay"("scheduleId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ScheduleDay_scheduleId_dayOfWeek_idx" ON "ScheduleDay"("scheduleId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ScheduleAction_timeWindowId_boundaryType_sortOrder_idx" ON "ScheduleAction"("timeWindowId", "boundaryType", "sortOrder");

-- CreateIndex
CREATE INDEX "ScheduleExecution_scheduleId_executedAt_idx" ON "ScheduleExecution"("scheduleId", "executedAt");

-- CreateIndex
CREATE INDEX "ScheduleExecution_executedAt_idx" ON "ScheduleExecution"("executedAt");

-- CreateIndex
CREATE INDEX "ScheduleExecution_status_idx" ON "ScheduleExecution"("status");
