import assert from "node:assert/strict";
import { generateSchedule } from "./generate-schedule.ts";
import type { AvailabilityWindow, ScheduleRequirement, ScheduleSubmission } from "./types.ts";

function window(day: AvailabilityWindow["day"], startHour: number, endHour: number): AvailabilityWindow {
  return { day, startHour, endHour };
}

function weekdayWindows(startHour: number, endHour: number): AvailabilityWindow[] {
  return (["MON", "TUE", "WED", "THU", "FRI"] as const).map((day) =>
    window(day, startHour, endHour),
  );
}

const requirement: ScheduleRequirement = {
  branchId: "branch-1",
  weekdayDayRequired: 1,
  weekdayNightRequired: 1,
  weekendDayRequired: 0,
  weekendNightRequired: 0,
  requiredSeniorPerShift: 1,
  maxSeniorPerShift: 1,
};

const submissions: ScheduleSubmission[] = [
  {
    employeeId: "1",
    workerName: "Aziz",
    senior: true,
    entries: weekdayWindows(9, 21),
  },
  {
    employeeId: "2",
    workerName: "Jamshid",
    senior: false,
    entries: [window("MON", 21, 9)],
  },
  {
    employeeId: "3",
    workerName: "Nodira",
    senior: false,
    entries: [window("TUE", 18, 6)],
  },
  {
    employeeId: "4",
    workerName: "Malika",
    senior: false,
    entries: [window("TUE", 9, 21)],
  },
  {
    employeeId: "5",
    workerName: "Sardor",
    senior: true,
    entries: weekdayWindows(21, 9),
  },
];

async function main(): Promise<void> {
  const result = await generateSchedule(requirement, submissions);

  assert.equal(result.status, "ok");
  assert.equal(result.unfilledSlots.length, 0);
  assert.equal(result.assignments.length, 10);

  const mondayDay = result.assignments.find(
    (assignment) => assignment.day === "MON" && assignment.shiftType === "DAY",
  );
  const mondayNight = result.assignments.find(
    (assignment) => assignment.day === "MON" && assignment.shiftType === "NIGHT",
  );
  const tuesdayNight = result.assignments.filter(
    (assignment) => assignment.day === "TUE" && assignment.shiftType === "NIGHT",
  );

  assert.equal(mondayDay?.workerName, "Aziz");
  assert.equal(mondayNight?.workerName, "Sardor");
  assert.deepEqual(
    tuesdayNight.map((assignment) => assignment.workerName),
    ["Sardor"],
  );
  assert.equal(
    result.assignments.some((assignment) => assignment.workerName === "Nodira"),
    false,
  );

  const partial = await generateSchedule(
    {
      ...requirement,
      weekdayDayRequired: 0,
      requiredSeniorPerShift: 0,
    },
    submissions.filter((submission) => submission.workerName !== "Sardor"),
  );

  assert.equal(partial.status, "infeasible");
  assert.equal(
    partial.assignments.some(
      (assignment) => assignment.workerName === "Jamshid" && assignment.day === "MON",
    ),
    true,
  );
  assert.equal(
    partial.assignments.some((assignment) => assignment.workerName === "Nodira"),
    false,
  );
  assert.equal(partial.unfilledSlots.length, 4);
  assert.ok(
    partial.unfilledSlots.every(
      (slot) => slot.reason === "Not enough people submitted availability for this slot.",
    ),
  );

  console.log("generateSchedule tests passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
