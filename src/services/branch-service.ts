import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../lib/http-error.ts";
import { prisma } from "../lib/prisma.ts";

export type BranchRecord = {
  id: string;
  name: string;
  address: string;
};

const NAME_MAX = 80;
const ADDRESS_MAX = 200;

function readObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Check the form and try again.");
  }

  return Object.fromEntries(Object.entries(body));
}

function readField(
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

function readBranchInput(body: unknown): { name: string; address: string } {
  const record = readObject(body);

  return {
    name: readField(
      record.name,
      "Enter a branch name.",
      NAME_MAX,
      "That name is too long.",
    ),
    address: readField(
      record.address,
      "Enter an address.",
      ADDRESS_MAX,
      "That address is too long.",
    ),
  };
}

function toBranchRecord(branch: BranchRecord): BranchRecord {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
  };
}

async function findBranchInOrganization(organizationId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, organizationId },
  });

  if (!branch) {
    throw new HttpError(404, "That branch was not found.");
  }

  return branch;
}

export async function listBranches(
  organizationId: string,
): Promise<BranchRecord[]> {
  const branches = await prisma.branch.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, address: true },
  });

  return branches.map(toBranchRecord);
}

export async function createBranch(
  organizationId: string,
  body: unknown,
): Promise<BranchRecord> {
  const input = readBranchInput(body);
  const branch = await prisma.branch.create({
    data: {
      organizationId,
      name: input.name,
      address: input.address,
    },
    select: { id: true, name: true, address: true },
  });

  return toBranchRecord(branch);
}

export async function updateBranch(
  organizationId: string,
  branchId: string,
  body: unknown,
): Promise<BranchRecord> {
  await findBranchInOrganization(organizationId, branchId);
  const input = readBranchInput(body);
  const branch = await prisma.branch.update({
    where: { id: branchId },
    data: { name: input.name, address: input.address },
    select: { id: true, name: true, address: true },
  });

  return toBranchRecord(branch);
}

export async function deleteBranch(
  organizationId: string,
  branchId: string,
): Promise<void> {
  await findBranchInOrganization(organizationId, branchId);

  try {
    await prisma.branch.delete({ where: { id: branchId } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new HttpError(
        409,
        "This branch still has schedules. Remove those first.",
      );
    }

    throw error;
  }
}
