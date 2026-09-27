import { SHIFT_WINDOWS } from "../lib/shift-windows.ts";
import type { ScheduleRequirement, ShiftType, SolverShift, Weekday } from "./types.ts";

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];
const WEEKEND_DAYS: Weekday[] = ["SAT", "SUN"];

function addSlots(
  slots: SolverShift[],
  requirement: ScheduleRequirement,
  days: Weekday[],
  shiftType: ShiftType,
  requiredTotal: number,
): void {
  if (requiredTotal <= 0) {
    return;
  }

  for (const day of days) {
    slots.push({
      id: `s${slots.length}`,
      branchId: requirement.branchId,
      day,
      shiftType,
      startHour: SHIFT_WINDOWS[shiftType].startHour,
      requiredTotal,
      requiredSenior: requirement.requiredSeniorPerShift,
      maxSenior: requirement.maxSeniorPerShift,
    });
  }
}

export function expandShiftSlots(requirement: ScheduleRequirement): SolverShift[] {
  const slots: SolverShift[] = [];

  addSlots(slots, requirement, WEEKDAYS, "DAY", requirement.weekdayDayRequired);
  addSlots(slots, requirement, WEEKDAYS, "NIGHT", requirement.weekdayNightRequired);
  addSlots(slots, requirement, WEEKEND_DAYS, "DAY", requirement.weekendDayRequired);
  addSlots(slots, requirement, WEEKEND_DAYS, "NIGHT", requirement.weekendNightRequired);

  return slots;
}
