export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type ShiftType = "DAY" | "NIGHT";

export type AvailabilityWindow = {
  day: Weekday;
  startHour: number;
  endHour: number;
};

export type ScheduleSubmission = {
  employeeId: string;
  workerName: string;
  senior: boolean;
  entries: AvailabilityWindow[];
};

export type ScheduleRequirement = {
  branchId: string;
  weekdayDayRequired: number;
  weekdayNightRequired: number;
  weekendDayRequired: number;
  weekendNightRequired: number;
  requiredSeniorPerShift: number;
  maxSeniorPerShift: number;
};

export type ScheduleAssignmentResult = {
  employeeId: string;
  workerName: string;
  branchId: string;
  day: Weekday;
  shiftType: ShiftType;
  startHour: number;
};

export type UnfilledSlot = {
  branchId: string;
  day: Weekday;
  shiftType: ShiftType;
  startHour: number;
  requiredTotal: number;
  assignedTotal: number;
  reason: string;
};

export type GenerateScheduleResult = {
  status: "ok" | "infeasible";
  assignments: ScheduleAssignmentResult[];
  unfilledSlots: UnfilledSlot[];
};

export type SolverWorker = {
  id: string;
  employeeId: string;
  name: string;
  senior: boolean;
  branchId: string;
  availability: AvailabilityWindow[];
};

export type SolverShift = {
  id: string;
  branchId: string;
  day: Weekday;
  shiftType: ShiftType;
  startHour: number;
  requiredTotal: number;
  requiredSenior: number;
  maxSenior: number;
};
