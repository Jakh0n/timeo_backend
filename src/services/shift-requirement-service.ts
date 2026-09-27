import {
  Prisma,
  ShiftRequirementStatus,
} from "../generated/prisma/client.ts";
import { HttpError } from "../lib/http-error.ts";
import { prisma } from "../lib/prisma.ts";

const COUNT_MAX = 50;
const LABEL_MAX = 40;

export type ShiftRequirementListItem = {
  id: string;
  branchName: string;
  cycleLabel: string;
  status: ShiftRequirementStatus;
  submissionCount: number;
  createdAt: string;
};

export type ShiftRequirementDetail = ShiftRequirementListItem & {
  branchId: string;
  weekdayDayRequired: number;
  weekdayNightRequired: number;
  weekendDayRequired: number;
  weekendNightRequired: number;
  requiredSeniorPerShift: number;
  maxSeniorPerShift: number;
  shareUrl: string;
};

type StaffingInput = {
  branchId: string;
  cycleLabel: string;
  weekdayDayRequired: number;
  weekdayNightRequired: number;
  weekendDayRequired: number;
  weekendNightRequired: number;
  requiredSeniorPerShift: number;
  maxSeniorPerShift: number;
};

function shareUrl(linkToken: string): string {
  const base = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  return `${base}/s/${linkToken}`;
}

function readObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Check the form and try again.");
  }

  return Object.fromEntries(Object.entries(body));
}

function readCount(value: unknown, message: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > COUNT_MAX
  ) {
    throw new HttpError(400, message);
  }

  return value;
}

function readCreateInput(body: unknown): StaffingInput {
  const record = readObject(body);
  const branchId = record.branchId;
  const cycleLabel = record.cycleLabel;

  if (typeof branchId !== "string" || branchId.trim().length === 0) {
    throw new HttpError(400, "Choose a branch.");
  }

  if (typeof cycleLabel !== "string" || cycleLabel.trim().length === 0) {
    throw new HttpError(400, "Enter a cycle label.");
  }

  if (cycleLabel.trim().length > LABEL_MAX) {
    throw new HttpError(400, "That cycle label is too long.");
  }

  const input: StaffingInput = {
    branchId: branchId.trim(),
    cycleLabel: cycleLabel.trim(),
    weekdayDayRequired: readCount(
      record.weekdayDayRequired,
      "Enter a whole number for the weekday day shift.",
    ),
    weekdayNightRequired: readCount(
      record.weekdayNightRequired,
      "Enter a whole number for the weekday night shift.",
    ),
    weekendDayRequired: readCount(
      record.weekendDayRequired,
      "Enter a whole number for the weekend day shift.",
    ),
    weekendNightRequired: readCount(
      record.weekendNightRequired,
      "Enter a whole number for the weekend night shift.",
    ),
    requiredSeniorPerShift: readCount(
      record.requiredSeniorPerShift,
      "Enter a whole number for the minimum seniors.",
    ),
    maxSeniorPerShift: readCount(
      record.maxSeniorPerShift,
      "Enter a whole number for the maximum seniors.",
    ),
  };

  const totalPeople =
    input.weekdayDayRequired +
    input.weekdayNightRequired +
    input.weekendDayRequired +
    input.weekendNightRequired;

  if (totalPeople < 1) {
    throw new HttpError(
      400,
      "Enter how many people you need for at least one shift.",
    );
  }

  if (input.maxSeniorPerShift < input.requiredSeniorPerShift) {
    throw new HttpError(400, "Max seniors can't be lower than the minimum.");
  }

  return input;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

type RequirementWithBranch = {
  id: string;
  branchId: string;
  cycleLabel: string;
  status: ShiftRequirementStatus;
  weekdayDayRequired: number;
  weekdayNightRequired: number;
  weekendDayRequired: number;
  weekendNightRequired: number;
  requiredSeniorPerShift: number;
  maxSeniorPerShift: number;
  linkToken: string;
  createdAt: Date;
  branch: { name: string };
  _count: { submissions: number };
};

function toListItem(requirement: RequirementWithBranch): ShiftRequirementListItem {
  return {
    id: requirement.id,
    branchName: requirement.branch.name,
    cycleLabel: requirement.cycleLabel,
    status: requirement.status,
    submissionCount: requirement._count.submissions,
    createdAt: requirement.createdAt.toISOString(),
  };
}

function toDetail(requirement: RequirementWithBranch): ShiftRequirementDetail {
  return {
    ...toListItem(requirement),
    branchId: requirement.branchId,
    weekdayDayRequired: requirement.weekdayDayRequired,
    weekdayNightRequired: requirement.weekdayNightRequired,
    weekendDayRequired: requirement.weekendDayRequired,
    weekendNightRequired: requirement.weekendNightRequired,
    requiredSeniorPerShift: requirement.requiredSeniorPerShift,
    maxSeniorPerShift: requirement.maxSeniorPerShift,
    shareUrl: shareUrl(requirement.linkToken),
  };
}

const requirementInclude = {
  branch: { select: { name: true } },
  _count: { select: { submissions: true } },
} as const;

async function findInOrganization(organizationId: string, requirementId: string) {
  const requirement = await prisma.shiftRequirement.findFirst({
    where: { id: requirementId, organizationId },
    include: requirementInclude,
  });

  if (!requirement) {
    throw new HttpError(404, "That shift requirement was not found.");
  }

  return requirement;
}

export async function listShiftRequirements(
  organizationId: string,
): Promise<ShiftRequirementListItem[]> {
  const requirements = await prisma.shiftRequirement.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: requirementInclude,
  });

  return requirements.map(toListItem);
}

export async function getShiftRequirement(
  organizationId: string,
  requirementId: string,
): Promise<ShiftRequirementDetail> {
  const requirement = await findInOrganization(organizationId, requirementId);
  return toDetail(requirement);
}

export async function createShiftRequirement(
  organizationId: string,
  body: unknown,
): Promise<ShiftRequirementDetail> {
  const input = readCreateInput(body);
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, organizationId },
    select: { id: true },
  });

  if (!branch) {
    throw new HttpError(400, "Choose a branch from this restaurant.");
  }

  const { nanoid } = await import("nanoid");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const requirement = await prisma.shiftRequirement.create({
        data: {
          organizationId,
          branchId: branch.id,
          cycleLabel: input.cycleLabel,
          weekdayDayRequired: input.weekdayDayRequired,
          weekdayNightRequired: input.weekdayNightRequired,
          weekendDayRequired: input.weekendDayRequired,
          weekendNightRequired: input.weekendNightRequired,
          requiredSeniorPerShift: input.requiredSeniorPerShift,
          maxSeniorPerShift: input.maxSeniorPerShift,
          linkToken: nanoid(21),
          status: ShiftRequirementStatus.DRAFT,
        },
        include: requirementInclude,
      });

      return toDetail(requirement);
    } catch (error) {
      if (attempt === 0 && isUniqueConflict(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new HttpError(500, "Something went wrong. Try again.");
}

export async function updateShiftRequirement(
  organizationId: string,
  requirementId: string,
  body: unknown,
): Promise<ShiftRequirementDetail> {
  const current = await findInOrganization(organizationId, requirementId);

  if (current.status !== ShiftRequirementStatus.DRAFT) {
    throw new HttpError(400, "You can edit the setup while this schedule is still a draft.");
  }

  const input = readCreateInput(body);
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, organizationId },
    select: { id: true },
  });

  if (!branch) {
    throw new HttpError(400, "Choose a branch from this restaurant.");
  }

  const requirement = await prisma.shiftRequirement.update({
    where: { id: current.id },
    data: {
      branchId: branch.id,
      cycleLabel: input.cycleLabel,
      weekdayDayRequired: input.weekdayDayRequired,
      weekdayNightRequired: input.weekdayNightRequired,
      weekendDayRequired: input.weekendDayRequired,
      weekendNightRequired: input.weekendNightRequired,
      requiredSeniorPerShift: input.requiredSeniorPerShift,
      maxSeniorPerShift: input.maxSeniorPerShift,
    },
    include: requirementInclude,
  });

  return toDetail(requirement);
}

export type SubmissionListItem = {
  workerName: string;
  employeeId: string;
  submittedAt: string;
};

export async function listSubmissions(
  organizationId: string,
  requirementId: string,
): Promise<{ count: number; submissions: SubmissionListItem[] }> {
  const requirement = await prisma.shiftRequirement.findFirst({
    where: { id: requirementId, organizationId },
    select: {
      submissions: {
        orderBy: { submittedAt: "desc" },
        select: {
          workerName: true,
          employeeId: true,
          submittedAt: true,
        },
      },
    },
  });

  if (!requirement) {
    throw new HttpError(404, "That shift requirement was not found.");
  }

  return {
    count: requirement.submissions.length,
    submissions: requirement.submissions.map((submission) => ({
      workerName: submission.workerName,
      employeeId: submission.employeeId,
      submittedAt: submission.submittedAt.toISOString(),
    })),
  };
}

export async function startCollecting(
  organizationId: string,
  requirementId: string,
): Promise<ShiftRequirementDetail> {
  const current = await findInOrganization(organizationId, requirementId);

  if (current.status !== ShiftRequirementStatus.DRAFT) {
    throw new HttpError(400, "Collecting can only start from a draft.");
  }

  const requirement = await prisma.shiftRequirement.update({
    where: { id: current.id },
    data: { status: ShiftRequirementStatus.COLLECTING },
    include: requirementInclude,
  });

  return toDetail(requirement);
}
