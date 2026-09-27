import { isAvailable, availAbsRange } from "./availability.ts";
import { expandShiftSlots } from "./expand-slots.ts";
import { solveSchedule } from "./model.ts";
import type {
  GenerateScheduleResult,
  ScheduleAssignmentResult,
  ScheduleRequirement,
  ScheduleSubmission,
  SolverShift,
  SolverWorker,
  UnfilledSlot,
} from "./types.ts";

export function toSolverWorkers(
  branchId: string,
  submissions: ScheduleSubmission[],
): SolverWorker[] {
  const byEmployee = new Map<string, ScheduleSubmission>();

  for (const submission of submissions) {
    const employeeId = submission.employeeId.trim();
    if (employeeId.length === 0) {
      continue;
    }

    const existing = byEmployee.get(employeeId);
    if (existing) {
      existing.entries.push(...submission.entries);
      continue;
    }

    byEmployee.set(employeeId, {
      employeeId,
      workerName: submission.workerName,
      senior: submission.senior,
      entries: [...submission.entries],
    });
  }

  return [...byEmployee.values()].map((submission, index) => ({
    id: `w${index}`,
    employeeId: submission.employeeId,
    name: submission.workerName,
    senior: submission.senior,
    branchId,
    availability: submission.entries,
  }));
}

function unfilledReason(
  shift: SolverShift,
  workers: SolverWorker[],
  windowsByWorker: Map<string, [number, number][]>,
): string {
  const eligible = workers.filter((worker) =>
    isAvailable(worker, shift, windowsByWorker.get(worker.id) ?? []),
  );
  const eligibleSeniors = eligible.filter((worker) => worker.senior).length;

  if (eligibleSeniors < shift.requiredSenior) {
    return eligibleSeniors === 0
      ? "No senior-level worker submitted availability for this slot."
      : "Not enough senior-level workers submitted availability for this slot.";
  }

  if (eligible.length < shift.requiredTotal) {
    return "Not enough people submitted availability for this slot.";
  }

  const maxAssignable = Math.min(eligible.length, eligible.length - eligibleSeniors + shift.maxSenior);
  if (maxAssignable < shift.requiredTotal) {
    return "The senior limit keeps this slot from being fully staffed.";
  }

  return "Not enough people could be scheduled without overlapping another shift.";
}

export function coverageReason(
  shift: SolverShift,
  workers: SolverWorker[],
): string {
  const windowsByWorker = new Map(
    workers.map((worker) => [worker.id, availAbsRange(worker.availability)]),
  );

  return unfilledReason(shift, workers, windowsByWorker);
}

function listUnfilled(
  shifts: SolverShift[],
  workers: SolverWorker[],
  assignedByShift: Map<string, number>,
): UnfilledSlot[] {
  const windowsByWorker = new Map(
    workers.map((worker) => [worker.id, availAbsRange(worker.availability)]),
  );

  return shifts.flatMap((shift) => {
    const assignedTotal = assignedByShift.get(shift.id) ?? 0;
    if (assignedTotal >= shift.requiredTotal) {
      return [];
    }

    return [
      {
        branchId: shift.branchId,
        day: shift.day,
        shiftType: shift.shiftType,
        startHour: shift.startHour,
        requiredTotal: shift.requiredTotal,
        assignedTotal,
        reason: unfilledReason(shift, workers, windowsByWorker),
      },
    ];
  });
}

export async function generateSchedule(
  shiftRequirement: ScheduleRequirement,
  submissions: ScheduleSubmission[],
): Promise<GenerateScheduleResult> {
  const shifts = expandShiftSlots(shiftRequirement);
  const workers = toSolverWorkers(shiftRequirement.branchId, submissions);

  if (shifts.length === 0) {
    return { status: "ok", assignments: [], unfilledSlots: [] };
  }

  const hard = await solveSchedule(workers, shifts, false);
  const solved = hard.status === "ok" ? hard : await solveSchedule(workers, shifts, true);
  const assignments = solved.status === "ok" ? solved.assignments : [];
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const assignedByShift = new Map<string, number>();
  const schedule: ScheduleAssignmentResult[] = [];

  for (const assignment of assignments) {
    const worker = workerById.get(assignment.workerId);
    const shift = shiftById.get(assignment.shiftId);
    if (!worker || !shift) {
      continue;
    }

    assignedByShift.set(shift.id, (assignedByShift.get(shift.id) ?? 0) + 1);
    schedule.push({
      employeeId: worker.employeeId,
      workerName: worker.name,
      branchId: shift.branchId,
      day: shift.day,
      shiftType: shift.shiftType,
      startHour: shift.startHour,
    });
  }

  const unfilledSlots = listUnfilled(shifts, workers, assignedByShift);

  return {
    status: unfilledSlots.length === 0 ? "ok" : "infeasible",
    assignments: schedule,
    unfilledSlots,
  };
}
