import {
  ShiftRequirementStatus,
  type ShiftType,
  type Weekday,
} from "../generated/prisma/client.ts";
import { prisma } from "../lib/prisma.ts";

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];
const WEEKEND_DAYS: Weekday[] = ["SAT", "SUN"];
const SHIFT_TYPES: ShiftType[] = ["DAY", "NIGHT"];

const ACTIVE_STATUSES: ShiftRequirementStatus[] = [
  ShiftRequirementStatus.DRAFT,
  ShiftRequirementStatus.COLLECTING,
  ShiftRequirementStatus.GENERATED,
];

type Staffing = {
  weekdayDayRequired: number;
  weekdayNightRequired: number;
  weekendDayRequired: number;
  weekendNightRequired: number;
};

export type DashboardOverview = {
  branchCount: number;
  activeShiftRequirementCount: number;
  latestActive: {
    id: string;
    cycleLabel: string;
    branchName: string;
    status: ShiftRequirementStatus;
    submissionCount: number;
  } | null;
  underfilled: {
    id: string;
    cycleLabel: string;
    branchName: string;
    shortSlots: number;
    missingPeople: number;
  }[];
};

function requiredCount(
  staffing: Staffing,
  day: Weekday,
  shiftType: ShiftType,
): number {
  const weekend = day === "SAT" || day === "SUN";

  if (weekend && shiftType === "DAY") {
    return staffing.weekendDayRequired;
  }

  if (weekend && shiftType === "NIGHT") {
    return staffing.weekendNightRequired;
  }

  if (shiftType === "DAY") {
    return staffing.weekdayDayRequired;
  }

  return staffing.weekdayNightRequired;
}

function shortfall(
  staffing: Staffing,
  assignments: { day: Weekday; shiftType: ShiftType }[],
): { shortSlots: number; missingPeople: number } {
  const filledBySlot = new Map<string, number>();

  for (const assignment of assignments) {
    const key = `${assignment.day}:${assignment.shiftType}`;
    filledBySlot.set(key, (filledBySlot.get(key) ?? 0) + 1);
  }

  let shortSlots = 0;
  let missingPeople = 0;

  for (const day of [...WEEKDAYS, ...WEEKEND_DAYS]) {
    for (const shiftType of SHIFT_TYPES) {
      const required = requiredCount(staffing, day, shiftType);
      const filled = filledBySlot.get(`${day}:${shiftType}`) ?? 0;

      if (filled < required) {
        shortSlots += 1;
        missingPeople += required - filled;
      }
    }
  }

  return { shortSlots, missingPeople };
}

export async function getDashboardOverview(
  organizationId: string,
): Promise<DashboardOverview> {
  const [branchCount, activeShiftRequirementCount, latestActive, generated] =
    await Promise.all([
      prisma.branch.count({ where: { organizationId } }),
      prisma.shiftRequirement.count({
        where: { organizationId, status: { in: ACTIVE_STATUSES } },
      }),
      prisma.shiftRequirement.findFirst({
        where: { organizationId, status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: "desc" },
        include: {
          branch: { select: { name: true } },
          _count: { select: { submissions: true } },
        },
      }),
      prisma.shiftRequirement.findMany({
        where: {
          organizationId,
          status: ShiftRequirementStatus.GENERATED,
        },
        orderBy: { createdAt: "desc" },
        include: {
          branch: { select: { name: true } },
          assignments: { select: { day: true, shiftType: true } },
        },
      }),
    ]);

  const underfilled = generated.flatMap((requirement) => {
    const gap = shortfall(requirement, requirement.assignments);

    if (gap.shortSlots === 0) {
      return [];
    }

    return [
      {
        id: requirement.id,
        cycleLabel: requirement.cycleLabel,
        branchName: requirement.branch.name,
        shortSlots: gap.shortSlots,
        missingPeople: gap.missingPeople,
      },
    ];
  });

  return {
    branchCount,
    activeShiftRequirementCount,
    latestActive: latestActive
      ? {
          id: latestActive.id,
          cycleLabel: latestActive.cycleLabel,
          branchName: latestActive.branch.name,
          status: latestActive.status,
          submissionCount: latestActive._count.submissions,
        }
      : null,
    underfilled,
  };
}
