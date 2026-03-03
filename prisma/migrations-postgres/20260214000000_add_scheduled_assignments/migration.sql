-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('COMPLEX_WEEKLY', 'ONCE', 'RECURRING');

-- CreateEnum
CREATE TYPE "ScheduleTargetType" AS ENUM ('IP_LIST', 'HOST_ALIAS', 'NETWORK_GROUP');

-- CreateEnum
CREATE TYPE "ScheduleOpType" AS ENUM ('ASSIGN', 'UNASSIGN', 'CLEAR_ALL');

-- CreateEnum
CREATE TYPE "ScheduleBoundaryType" AS ENUM ('START', 'END');

-- CreateEnum
CREATE TYPE "ScheduleExecutionStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "ScheduledAssignment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduleType" "ScheduleType" NOT NULL DEFAULT 'COMPLEX_WEEKLY',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "executeAt" TIMESTAMP(3),
    "cronExpression" TEXT,
    "targetType" "ScheduleTargetType" NOT NULL,
    "targetSelector" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastExecutedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduledAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleDay" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,

    CONSTRAINT "ScheduleDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeWindow" (
    "id" TEXT NOT NULL,
    "scheduleDayId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "TimeWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAction" (
    "id" TEXT NOT NULL,
    "operation" "ScheduleOpType" NOT NULL,
    "boundaryType" "ScheduleBoundaryType" NOT NULL,
    "targetGroupUuid" TEXT,
    "fromGroupUuid" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "timeWindowId" TEXT,
    "onceScheduleId" TEXT,
    "recurringScheduleId" TEXT,

    CONSTRAINT "ScheduleAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleExecution" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "boundaryType" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ScheduleExecutionStatus" NOT NULL,
    "targetIps" JSONB NOT NULL,
    "actionsRun" JSONB NOT NULL,
    "durationMs" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "ScheduleExecution_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "ScheduleDay" ADD CONSTRAINT "ScheduleDay_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduledAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeWindow" ADD CONSTRAINT "TimeWindow_scheduleDayId_fkey" FOREIGN KEY ("scheduleDayId") REFERENCES "ScheduleDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAction" ADD CONSTRAINT "ScheduleAction_timeWindowId_fkey" FOREIGN KEY ("timeWindowId") REFERENCES "TimeWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAction" ADD CONSTRAINT "ScheduleAction_onceScheduleId_fkey" FOREIGN KEY ("onceScheduleId") REFERENCES "ScheduledAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAction" ADD CONSTRAINT "ScheduleAction_recurringScheduleId_fkey" FOREIGN KEY ("recurringScheduleId") REFERENCES "ScheduledAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleExecution" ADD CONSTRAINT "ScheduleExecution_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduledAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

