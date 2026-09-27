import {
  ShiftRequirementStatus,
  type ShiftType,
  type Weekday,
} from "../generated/prisma/client.ts";
import { HttpError } from "../lib/http-error.ts";
import { prisma } from "../lib/prisma.ts";
import { SHIFT_WINDOWS } from "../lib/shift-windows.ts";

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const SHIFT_TYPES: ShiftType[] = ["DAY", "NIGHT"];
const NAME_MAX = 80;
const EMPLOYEE_ID_MAX = 40;
const ENTRY_MAX = 14;

const OPEN_STATUSES: ShiftRequirementStatus[] = [
  ShiftRequirementStatus.DRAFT,
  ShiftRequirementStatus.COLLECTING,
];

export type PublicShiftLink = {
  status: ShiftRequirementStatus;
  restaurantName: string;
  branchName: string;
  cycleLabel: string;
};

export type AvailabilityEntryInput = {
  day: Weekday;
  shiftType: ShiftType;
  startHour: number;
  endHour: number;
};

export type OwnSubmission =
  | { found: false }
  | {
      found: true;
      workerName: string;
      entries: AvailabilityEntryInput[];
    };

export type PublicShift = {
  day: Weekday;
  shiftType: ShiftType;
  startHour: number;
  endHour: number;
  branchName: string;
};

export type MySchedule =
  | { status: "GENERATED" }
  | { status: "CONFIRMED"; found: false }
  | {
      status: "CONFIRMED";
      found: true;
      workerName: string;
      shifts: PublicShift[];
    };

function readObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Check the form and try again.");
  }

  return Object.fromEntries(Object.entries(body));
}

function readText(
  value: unknown,
  emptyMessage: string,
  max: number,
  longMessage: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, emptyMessage);
  }

  const trimmed = value.trim();

  if (trimmed.length > max) {
    throw new HttpError(400, longMessage);
  }

  return trimmed;
}

function readHour(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 23) {
    return null;
  }

  return value;
}

function readEmployeeId(value: unknown): string {
  return readText(
    value,
    "Enter your employee ID.",
    EMPLOYEE_ID_MAX,
    "That employee ID is too long.",
  );
}

function readEntries(value: unknown): AvailabilityEntryInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "Mark at least one day you can work.");
  }

  if (value.length > ENTRY_MAX) {
    throw new HttpError(400, "That's too many time windows.");
  }

  return value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new HttpError(400, "Check the days and try again.");
    }

    const record = Object.fromEntries(Object.entries(entry));
    const day = record.day;
    const shiftType = record.shiftType;
    const startHour = readHour(record.startHour);
    const endHour = readHour(record.endHour);

    if (typeof day !== "string" || !WEEKDAYS.includes(day as Weekday)) {
      throw new HttpError(400, "Check the days and try again.");
    }

    if (
      typeof shiftType !== "string" ||
      !SHIFT_TYPES.includes(shiftType as ShiftType)
    ) {
      throw new HttpError(400, "Choose day or night for each window.");
    }

    if (startHour === null || endHour === null) {
      throw new HttpError(400, "Choose a start and end hour for each window.");
    }

    return {
      day: day as Weekday,
      shiftType: shiftType as ShiftType,
      startHour,
      endHour,
    };
  });
}

async function findByLinkToken(linkToken: string) {
  const requirement = await prisma.shiftRequirement.findUnique({
    where: { linkToken },
    select: {
      id: true,
      status: true,
      cycleLabel: true,
      branch: { select: { name: true } },
      organization: { select: { name: true } },
    },
  });

  if (!requirement) {
    throw new HttpError(404, "This link doesn't match a schedule.");
  }

  return requirement;
}

export async function getPublicShiftLink(
  linkToken: string,
): Promise<PublicShiftLink> {
  const requirement = await findByLinkToken(linkToken);

  return {
    status: requirement.status,
    restaurantName: requirement.organization.name,
    branchName: requirement.branch.name,
    cycleLabel: requirement.cycleLabel,
  };
}

export async function getOwnSubmission(
  linkToken: string,
  employeeIdValue: unknown,
): Promise<OwnSubmission> {
  const requirement = await findByLinkToken(linkToken);

  if (!OPEN_STATUSES.includes(requirement.status)) {
    throw new HttpError(400, "This link is no longer taking availability.");
  }

  const employeeId = readEmployeeId(employeeIdValue);
  const submission = await prisma.availabilitySubmission.findUnique({
    where: {
      shiftRequirementId_employeeId: {
        shiftRequirementId: requirement.id,
        employeeId,
      },
    },
    select: {
      workerName: true,
      entries: {
        select: {
          day: true,
          shiftType: true,
          startHour: true,
          endHour: true,
        },
      },
    },
  });

  if (!submission) {
    return { found: false };
  }

  return {
    found: true,
    workerName: submission.workerName,
    entries: submission.entries,
  };
}

export async function submitAvailability(
  linkToken: string,
  body: unknown,
): Promise<void> {
  const requirement = await findByLinkToken(linkToken);

  if (!OPEN_STATUSES.includes(requirement.status)) {
    throw new HttpError(400, "This link is no longer taking availability.");
  }

  const record = readObject(body);
  const workerName = readText(
    record.workerName,
    "Enter your full name.",
    NAME_MAX,
    "That name is too long.",
  );
  const employeeId = readEmployeeId(record.employeeId);
  const entries = readEntries(record.entries);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.availabilitySubmission.findUnique({
      where: {
        shiftRequirementId_employeeId: {
          shiftRequirementId: requirement.id,
          employeeId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await tx.availabilityEntry.deleteMany({
        where: { availabilitySubmissionId: existing.id },
      });
      await tx.availabilitySubmission.update({
        where: { id: existing.id },
        data: {
          workerName,
          submittedAt: new Date(),
          entries: { create: entries },
        },
      });
      return;
    }

    await tx.availabilitySubmission.create({
      data: {
        shiftRequirementId: requirement.id,
        workerName,
        employeeId,
        entries: { create: entries },
      },
    });
  });
}

export async function getMySchedule(
  linkToken: string,
  employeeIdValue: unknown,
): Promise<MySchedule> {
  const requirement = await findByLinkToken(linkToken);
  const employeeId = readEmployeeId(employeeIdValue);

  if (
    requirement.status === ShiftRequirementStatus.DRAFT ||
    requirement.status === ShiftRequirementStatus.COLLECTING
  ) {
    throw new HttpError(400, "A schedule hasn't been made yet.");
  }

  if (requirement.status === ShiftRequirementStatus.GENERATED) {
    return { status: "GENERATED" };
  }

  const assignments = await prisma.scheduleAssignment.findMany({
    where: {
      shiftRequirementId: requirement.id,
      employeeId,
    },
    select: {
      day: true,
      shiftType: true,
      workerName: true,
      branch: { select: { name: true } },
    },
  });

  if (assignments.length === 0) {
    return { status: "CONFIRMED", found: false };
  }

  const shifts = assignments
    .map((assignment) => {
      const window = SHIFT_WINDOWS[assignment.shiftType];

      return {
        day: assignment.day,
        shiftType: assignment.shiftType,
        startHour: window.startHour,
        endHour: window.endHour,
        branchName: assignment.branch.name,
      };
    })
    .sort((left, right) => {
      const dayOrder = WEEKDAYS.indexOf(left.day) - WEEKDAYS.indexOf(right.day);

      if (dayOrder !== 0) {
        return dayOrder;
      }

      return left.shiftType.localeCompare(right.shiftType);
    });

  return {
    status: "CONFIRMED",
    found: true,
    workerName: assignments[0]?.workerName ?? "",
    shifts,
  };
}
