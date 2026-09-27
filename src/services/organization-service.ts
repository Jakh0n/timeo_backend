import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../lib/http-error.ts";
import { prisma } from "../lib/prisma.ts";
import { toSlug } from "../lib/slug.ts";

export type CreatedOrganization = {
  id: string;
  name: string;
  slug: string;
};

function readRestaurantName(body: unknown): string {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Check the form and try again.");
  }

  const name = "name" in body ? body.name : undefined;

  if (typeof name !== "string" || name.trim().length === 0) {
    throw new HttpError(400, "Enter your restaurant's name.");
  }

  const trimmed = name.trim();

  if (trimmed.length > 80) {
    throw new HttpError(400, "That name is too long.");
  }

  return trimmed;
}

function isSlugConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function attachOrganization(
  managerId: string,
  name: string,
  slug: string,
): Promise<CreatedOrganization> {
  return prisma.$transaction(async (tx) => {
    const manager = await tx.managerUser.findUnique({
      where: { id: managerId },
    });

    if (!manager) {
      throw new HttpError(401, "You need to log in.");
    }

    if (manager.organizationId) {
      throw new HttpError(400, "You already have a restaurant.");
    }

    const organization = await tx.organization.create({
      data: { name, slug },
    });

    await tx.managerUser.update({
      where: { id: managerId },
      data: { organizationId: organization.id },
    });

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    };
  });
}

export async function createOrganizationForManager(
  managerId: string,
  body: unknown,
): Promise<CreatedOrganization> {
  const name = readRestaurantName(body);
  const baseSlug = toSlug(name);
  const existing = await prisma.organization.findUnique({
    where: { slug: baseSlug },
  });
  const { nanoid } = await import("nanoid");
  const slug = existing
    ? `${baseSlug}-${nanoid(6).toLowerCase()}`
    : baseSlug;

  try {
    return await attachOrganization(managerId, name, slug);
  } catch (error) {
    if (!isSlugConflict(error)) {
      throw error;
    }

    return attachOrganization(
      managerId,
      name,
      `${baseSlug}-${nanoid(6).toLowerCase()}`,
    );
  }
}
