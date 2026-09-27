import {
  AssignmentStatus,
  ShiftRequirementStatus,
  type ShiftType,
  type Weekday,
} from "../generated/prisma/client.ts";
import { HttpError } from "../lib/http-error.ts";
import { prisma } from "../lib/prisma.ts";
import { SHIFT_WINDOWS } from "../lib/shift-windows.ts";
import { availAbsRange, isAvailable, MIN_REST_HOURS, restGap } from "../scheduler/availability.ts";
import { expandShiftSlots } from "../scheduler/expand-slots.ts";
import { coverageReason, toSolverWorkers } from "../scheduler/generate-schedule.ts";
import type { SolverShift, SolverWorker } from "../scheduler/types.ts";
import { getShiftRequirement, type ShiftRequirementDetail } from "../services/shift-requirement-service.ts";

const DAYS = new Set<Weekday>(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
const SHIFT_TYPES = new Set<ShiftType>(["DAY", "NIGHT"]);

export type ScheduleChip = {
  id: string;
  workerName: string;
  employeeId: string;
};

export type ScheduleCandidate = {
  workerName: string;
  employeeId: string;
};

export type ScheduleSlot = {
  day: Weekday;
  shiftType: ShiftType;
  startHour: number;
  endHour: number;
  requiredTotal: number;
  assignments: ScheduleChip[];
  reason: string | null;
  candidates: ScheduleCandidate[];
};

type StoredAssignment = {
  id: string;
  workerName: string;
  employeeId: string;
  day: Weekday;
  shiftType: ShiftType;
};

function readObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Check the form and try again.");
  }

  return Object.fromEntries(Object.entries(body));
}

function readDay(value: unknown): Weekday {
  if (typeof value !== "string" || !DAYS.has(value as Weekday)) {
    throw new HttpError(400, "Choose a day.");
  }

  return value as Weekday;
}

function readShiftType(value: unknown): ShiftType {
  if (typeof value !== "string" || !SHIFT_TYPES.has(value as ShiftType)) {
    throw new HttpError(400, "Choose a day or night shift.");
  }

  return value as ShiftType;
}

function readEmployeeId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, "Choose a person.");
  }

  return value.trim();
}

function slotKey(day: Weekday, shiftType: ShiftType): string {
  return `${day}:${shiftType}`;
}

function overlapsAssignment(
  shift: SolverShift,
  worker: SolverWorker,
  assignments: StoredAssignment[],
): boolean {
  return assignments.some((assignment) => {
    if (assignment.employeeId !== worker.employeeId) {
      return false;
    }

    if (assignment.day === shift.day && assignment.shiftType === shift.shiftType) {
      return false;
    }

    const other: SolverShift = {
      id: slotKey(assignment.day, assignment.shiftType),
      branchId: shift.branchId,
      day: assignment.day,
      shiftType: assignment.shiftType,
      startHour: SHIFT_WINDOWS[assignment.shiftType].startHour,
      requiredTotal: 0,
      requiredSenior: 0,
      maxSenior: 0,
    };

    return restGap(shift, other) < MIN_REST_HOURS;
  });
}

function candidatesForSlot(
  shift: SolverShift,
  workers: SolverWorker[],
  assignments: StoredAssignment[],
  windowsByWorker: Map<string, [number, number][]>,
): ScheduleCandidate[] {
  return workers
    .filter((worker) => {
      const alreadyHere = assignments.some(
        (assignment) =>
          assignment.employeeId === worker.employeeId &&
          assignment.day === shift.day &&
          assignment.shiftType === shift.shiftType,
      );

      if (alreadyHere) {
        return false;
      }

      if (!isAvailable(worker, shift, windowsByWorker.get(worker.id) ?? [])) {
        return false;
      }

      return !overlapsAssignment(shift, worker, assignments);
    })
    .map((worker) => ({
      workerName: worker.name,
      employeeId: worker.employeeId,
    }))
    .sort((left, right) => left.workerName.localeCompare(right.workerName));
}

function slotReason(
  shift: SolverShift,
  workers: SolverWorker[],
  assignedCount: number,
  openCandidates: number,
): string | null {
  if (assignedCount >= shift.requiredTotal) {
    return null;
  }

  const missing = shift.requiredTotal - assignedCount;

  if (openCandidates > 0) {
    const people = missing === 1 ? "person" : "people";
    if (openCandidates < missing) {
      const available =
        openCandidates === 1 ? "1 person is" : `${openCandidates} people are`;
      return `This shift still needs ${missing} more ${people}. Only ${available} still available.`;
    }

    return `This shift still needs ${missing} more ${people}.`;
  }

  return coverageReason(shift, workers);
}

function buildBoard(
  shifts: SolverShift[],
  workers: SolverWorker[],
  assignments: StoredAssignment[],
  editable: boolean,
): ScheduleSlot[] {
  const windowsByWorker = new Map(
    workers.map((worker) => [worker.id, availAbsRange(worker.availability)]),
  );

  return shifts.map((shift) => {
    const assigned = assignments
      .filter(
        (assignment) =>
          assignment.day === shift.day && assignment.shiftType === shift.shiftType,
      )
      .sort((left, right) => left.workerName.localeCompare(right.workerName));
    const openCandidates = candidatesForSlot(shift, workers, assignments, windowsByWorker);
    const window = SHIFT_WINDOWS[shift.shiftType];

    return {
      day: shift.day,
      shiftType: shift.shiftType,
      startHour: window.startHour,
      endHour: window.endHour,
      requiredTotal: shift.requiredTotal,
      assignments: assigned.map((assignment) => ({
        id: assignment.id,
        workerName: assignment.workerName,
        employeeId: assignment.employeeId,
      })),
      reason: slotReason(shift, workers, assigned.length, openCandidates.length),
      candidates: editable ? openCandidates : [],
    };
  });
}

async function loadRequirement(organizationId: string, requirementId: string) {
  const requirement = await prisma.shiftRequirement.findFirst({
    where: { id: requirementId, organizationId },
    include: {
      submissions: { include: { entries: true } },
      assignments: {
        select: {
          id: true,
          workerName: true,
          employeeId: true,
          day: true,
          shiftType: true,
        },
      },
    },
  });

  if (!requirement) {
    throw new HttpError(404, "That shift requirement was not found.");
  }

  return requirement;
}

export async function getScheduleBoard(
  organizationId: string,
  requirementId: string,
): Promise<ScheduleSlot[]> {
  const requirement = await loadRequirement(organizationId, requirementId);
  const shifts = expandShiftSlots(requirement);
  const workers = toSolverWorkers(
    requirement.branchId,
    requirement.submissions.map((submission) => ({
      employeeId: submission.employeeId,
      workerName: submission.workerName,
      senior: false,
      entries: submission.entries.map((entry) => ({
        day: entry.day,
        startHour: entry.startHour,
        endHour: entry.endHour,
      })),
    })),
  );

  return buildBoard(
    shifts,
    workers,
    requirement.assignments,
    requirement.status === ShiftRequirementStatus.GENERATED,
  );
}

export async function addScheduleAssignment(
  organizationId: string,
  requirementId: string,
  body: unknown,
): Promise<ScheduleSlot[]> {
  const record = readObject(body);
  const day = readDay(record.day);
  const shiftType = readShiftType(record.shiftType);
  const employeeId = readEmployeeId(record.employeeId);
  const requirement = await loadRequirement(organizationId, requirementId);

  if (requirement.status !== ShiftRequirementStatus.GENERATED) {
    throw new HttpError(400, "You can edit assignments after the schedule is generated.");
  }

  const shift = expandShiftSlots(requirement).find(
    (slot) => slot.day === day && slot.shiftType === shiftType,
  );

  if (!shift) {
    throw new HttpError(400, "That shift isn't part of this schedule.");
  }

  const submission = requirement.submissions.find(
    (item) => item.employeeId === employeeId,
  );

  if (!submission) {
    throw new HttpError(400, "Choose someone who submitted availability.");
  }

  const worker: SolverWorker = {
    id: "selected",
    employeeId: submission.employeeId,
    name: submission.workerName,
    senior: false,
    branchId: requirement.branchId,
    availability: submission.entries.map((entry) => ({
      day: entry.day,
      startHour: entry.startHour,
      endHour: entry.endHour,
    })),
  };

  if (!isAvailable(worker, shift, availAbsRange(worker.availability))) {
    throw new HttpError(400, "This person isn't available for this shift.");
  }

  if (overlapsAssignment(shift, worker, requirement.assignments)) {
    throw new HttpError(400, "This person is already on an overlapping shift.");
  }

  const alreadyHere = requirement.assignments.some(
    (assignment) =>
      assignment.employeeId === employeeId &&
      assignment.day === day &&
      assignment.shiftType === shiftType,
  );

  if (alreadyHere) {
    throw new HttpError(400, "This person is already on this shift.");
  }

  await prisma.scheduleAssignment.create({
    data: {
      shiftRequirementId: requirement.id,
      branchId: requirement.branchId,
      workerName: submission.workerName,
      employeeId: submission.employeeId,
      day,
      shiftType,
      status: AssignmentStatus.PROPOSED,
    },
  });

  return getScheduleBoard(organizationId, requirementId);
}

export async function removeScheduleAssignment(
  organizationId: string,
  requirementId: string,
  assignmentId: string,
): Promise<ScheduleSlot[]> {
  const requirement = await prisma.shiftRequirement.findFirst({
    where: { id: requirementId, organizationId },
    select: { id: true, status: true },
  });

  if (!requirement) {
    throw new HttpError(404, "That shift requirement was not found.");
  }

  if (requirement.status !== ShiftRequirementStatus.GENERATED) {
    throw new HttpError(400, "You can edit assignments after the schedule is generated.");
  }

  const assignment = await prisma.scheduleAssignment.findFirst({
    where: { id: assignmentId, shiftRequirementId: requirement.id },
    select: { id: true },
  });

  if (!assignment) {
    throw new HttpError(404, "That assignment was not found.");
  }

  await prisma.scheduleAssignment.delete({ where: { id: assignment.id } });

  return getScheduleBoard(organizationId, requirementId);
}

export async function confirmSchedule(
  organizationId: string,
  requirementId: string,
): Promise<ShiftRequirementDetail> {
  const requirement = await prisma.shiftRequirement.findFirst({
    where: { id: requirementId, organizationId },
    select: { id: true, status: true },
  });

  if (!requirement) {
    throw new HttpError(404, "That shift requirement was not found.");
  }

  if (requirement.status !== ShiftRequirementStatus.GENERATED) {
    throw new HttpError(400, "Confirm the schedule after it has been generated.");
  }

  await prisma.$transaction([
    prisma.scheduleAssignment.updateMany({
      where: { shiftRequirementId: requirement.id },
      data: { status: AssignmentStatus.CONFIRMED },
    }),
    prisma.shiftRequirement.update({
      where: { id: requirement.id },
      data: { status: ShiftRequirementStatus.CONFIRMED },
    }),
  ]);

  return getShiftRequirement(organizationId, requirementId);
}

export async function reopenSchedule(
  organizationId: string,
  requirementId: string,
): Promise<ShiftRequirementDetail> {
  const requirement = await prisma.shiftRequirement.findFirst({
    where: { id: requirementId, organizationId },
    select: { id: true, status: true },
  });

  if (!requirement) {
    throw new HttpError(404, "That shift requirement was not found.");
  }

  if (requirement.status !== ShiftRequirementStatus.CONFIRMED) {
    throw new HttpError(400, "Only a confirmed schedule can be reopened.");
  }

  await prisma.$transaction([
    prisma.scheduleAssignment.updateMany({
      where: { shiftRequirementId: requirement.id },
      data: { status: AssignmentStatus.PROPOSED },
    }),
    prisma.shiftRequirement.update({
      where: { id: requirement.id },
      data: { status: ShiftRequirementStatus.GENERATED },
    }),
  ]);

  return getShiftRequirement(organizationId, requirementId);
}
