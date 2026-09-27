import { AssignmentStatus, ShiftRequirementStatus } from "../generated/prisma/client.ts";
import { HttpError } from "../lib/http-error.ts";
import { prisma } from "../lib/prisma.ts";
import { generateSchedule } from "../scheduler/generate-schedule.ts";
import type { GenerateScheduleResult } from "../scheduler/types.ts";

export async function generateShiftRequirement(
  organizationId: string,
  requirementId: string,
): Promise<GenerateScheduleResult> {
  const requirement = await prisma.shiftRequirement.findFirst({
    where: { id: requirementId, organizationId },
    include: { submissions: { include: { entries: true } } },
  });

  if (!requirement) {
    throw new HttpError(404, "That shift requirement was not found.");
  }

  if (requirement.status === ShiftRequirementStatus.CONFIRMED) {
    throw new HttpError(400, "This schedule is already confirmed.");
  }

  const result = await generateSchedule(
    {
      branchId: requirement.branchId,
      weekdayDayRequired: requirement.weekdayDayRequired,
      weekdayNightRequired: requirement.weekdayNightRequired,
      weekendDayRequired: requirement.weekendDayRequired,
      weekendNightRequired: requirement.weekendNightRequired,
      requiredSeniorPerShift: requirement.requiredSeniorPerShift,
      maxSeniorPerShift: requirement.maxSeniorPerShift,
    },
    requirement.submissions.map((submission) => ({
      employeeId: submission.employeeId,
      workerName: submission.workerName,
      // Submissions do not record seniority yet, so the senior band stays empty.
      senior: false,
      entries: submission.entries.map((entry) => ({
        day: entry.day,
        startHour: entry.startHour,
        endHour: entry.endHour,
      })),
    })),
  );

  await prisma.$transaction(async (tx) => {
    await tx.scheduleAssignment.deleteMany({
      where: {
        shiftRequirementId: requirement.id,
        status: AssignmentStatus.PROPOSED,
      },
    });

    if (result.assignments.length > 0) {
      await tx.scheduleAssignment.createMany({
        data: result.assignments.map((assignment) => ({
          shiftRequirementId: requirement.id,
          branchId: assignment.branchId,
          workerName: assignment.workerName,
          employeeId: assignment.employeeId,
          day: assignment.day,
          shiftType: assignment.shiftType,
          status: AssignmentStatus.PROPOSED,
        })),
      });
    }

    await tx.shiftRequirement.update({
      where: { id: requirement.id },
      data: { status: ShiftRequirementStatus.GENERATED },
    });
  });

  return result;
}
