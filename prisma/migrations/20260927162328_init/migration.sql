-- CreateEnum
CREATE TYPE "ManagerRole" AS ENUM ('OWNER', 'MANAGER');

-- CreateEnum
CREATE TYPE "ShiftRequirementStatus" AS ENUM ('DRAFT', 'COLLECTING', 'GENERATED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('DAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PROPOSED', 'CONFIRMED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerUser" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "role" "ManagerRole" NOT NULL,

    CONSTRAINT "ManagerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftRequirement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cycleLabel" TEXT NOT NULL,
    "weekdayDayRequired" INTEGER NOT NULL,
    "weekdayNightRequired" INTEGER NOT NULL,
    "weekendDayRequired" INTEGER NOT NULL,
    "weekendNightRequired" INTEGER NOT NULL,
    "requiredSeniorPerShift" INTEGER NOT NULL DEFAULT 1,
    "maxSeniorPerShift" INTEGER NOT NULL DEFAULT 1,
    "linkToken" TEXT NOT NULL,
    "status" "ShiftRequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySubmission" (
    "id" TEXT NOT NULL,
    "shiftRequirementId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilitySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityEntry" (
    "id" TEXT NOT NULL,
    "availabilitySubmissionId" TEXT NOT NULL,
    "day" "Weekday" NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,

    CONSTRAINT "AvailabilityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" TEXT NOT NULL,
    "shiftRequirementId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "day" "Weekday" NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "status" "AssignmentStatus" NOT NULL,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerUser_email_key" ON "ManagerUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerUser_googleId_key" ON "ManagerUser"("googleId");

-- CreateIndex
CREATE INDEX "ManagerUser_organizationId_idx" ON "ManagerUser"("organizationId");

-- CreateIndex
CREATE INDEX "Branch_organizationId_idx" ON "Branch"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftRequirement_linkToken_key" ON "ShiftRequirement"("linkToken");

-- CreateIndex
CREATE INDEX "ShiftRequirement_organizationId_idx" ON "ShiftRequirement"("organizationId");

-- CreateIndex
CREATE INDEX "ShiftRequirement_branchId_idx" ON "ShiftRequirement"("branchId");

-- CreateIndex
CREATE INDEX "AvailabilitySubmission_shiftRequirementId_idx" ON "AvailabilitySubmission"("shiftRequirementId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySubmission_shiftRequirementId_employeeId_key" ON "AvailabilitySubmission"("shiftRequirementId", "employeeId");

-- CreateIndex
CREATE INDEX "AvailabilityEntry_availabilitySubmissionId_idx" ON "AvailabilityEntry"("availabilitySubmissionId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_shiftRequirementId_idx" ON "ScheduleAssignment"("shiftRequirementId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_branchId_idx" ON "ScheduleAssignment"("branchId");

-- AddForeignKey
ALTER TABLE "ManagerUser" ADD CONSTRAINT "ManagerUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRequirement" ADD CONSTRAINT "ShiftRequirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRequirement" ADD CONSTRAINT "ShiftRequirement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySubmission" ADD CONSTRAINT "AvailabilitySubmission_shiftRequirementId_fkey" FOREIGN KEY ("shiftRequirementId") REFERENCES "ShiftRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityEntry" ADD CONSTRAINT "AvailabilityEntry_availabilitySubmissionId_fkey" FOREIGN KEY ("availabilitySubmissionId") REFERENCES "AvailabilitySubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_shiftRequirementId_fkey" FOREIGN KEY ("shiftRequirementId") REFERENCES "ShiftRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
