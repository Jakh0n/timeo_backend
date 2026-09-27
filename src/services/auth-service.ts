import bcrypt from "bcrypt";
import type { ManagerUser } from "../generated/prisma/client.ts";
import { ManagerRole } from "../generated/prisma/client.ts";
import { toAuthUser, type AuthUser } from "../lib/auth-user.ts";
import { HttpError } from "../lib/http-error.ts";
import { prisma } from "../lib/prisma.ts";

const PASSWORD_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Credentials = {
  email: string;
  password: string;
};

export type SignupInput = Credentials & {
  name: string;
};

function readObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Check the form and try again.");
  }

  return Object.fromEntries(Object.entries(body));
}

function readName(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, message);
  }

  const name = value.trim();

  if (name.length > 80) {
    throw new HttpError(400, "That name is too long.");
  }

  return name;
}

function readEmail(value: unknown): string {
  if (typeof value !== "string" || !EMAIL_PATTERN.test(value.trim())) {
    throw new HttpError(400, "Enter a valid email address.");
  }

  return value.trim().toLowerCase();
}

function readPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8) {
    throw new HttpError(400, "Use at least 8 characters.");
  }

  if (value.length > 72) {
    throw new HttpError(400, "Use a shorter password.");
  }

  return value;
}

export function parseSignupBody(body: unknown): SignupInput {
  const record = readObject(body);

  return {
    name: readName(record.name, "Enter your name."),
    email: readEmail(record.email),
    password: readPassword(record.password),
  };
}

export function parseLoginBody(body: unknown): Credentials {
  const record = readObject(body);

  return {
    email: readEmail(record.email),
    password: readPassword(record.password),
  };
}

export type ManagerSession = AuthUser & {
  organization: {
    id: string;
    name: string;
  } | null;
};

export async function getManagerSession(
  user: ManagerUser,
): Promise<ManagerSession> {
  const organization = user.organizationId
    ? await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { id: true, name: true },
      })
    : null;

  return {
    ...toAuthUser(user),
    organization,
  };
}

export async function signupManager(input: SignupInput): Promise<AuthUser> {
  const existing = await prisma.managerUser.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new HttpError(409, "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_ROUNDS);
  const user = await prisma.managerUser.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: ManagerRole.OWNER,
    },
  });

  return toAuthUser(user);
}

export async function loginManager(input: Credentials): Promise<AuthUser> {
  const user = await prisma.managerUser.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new HttpError(401, "Email or password is incorrect.");
  }

  if (!user.passwordHash) {
    throw new HttpError(401, "This account uses Google sign-in.");
  }

  const matches = await bcrypt.compare(input.password, user.passwordHash);

  if (!matches) {
    throw new HttpError(401, "Email or password is incorrect.");
  }

  return toAuthUser(user);
}

export async function findOrCreateGoogleManager(profile: {
  googleId: string;
  email: string | undefined;
  name: string | undefined;
}): Promise<ManagerUser> {
  if (!profile.email) {
    throw new HttpError(400, "Your Google account has no email address.");
  }

  const email = profile.email.trim().toLowerCase();
  const byGoogleId = await prisma.managerUser.findUnique({
    where: { googleId: profile.googleId },
  });

  if (byGoogleId) {
    return byGoogleId;
  }

  const byEmail = await prisma.managerUser.findUnique({
    where: { email },
  });

  if (byEmail) {
    if (byEmail.googleId && byEmail.googleId !== profile.googleId) {
      throw new HttpError(
        409,
        "This email is already linked to a different Google account.",
      );
    }

    return prisma.managerUser.update({
      where: { id: byEmail.id },
      data: { googleId: profile.googleId },
    });
  }

  const name = profile.name?.trim() || email.split("@")[0] || "Manager";

  return prisma.managerUser.create({
    data: {
      name: name.slice(0, 80),
      email,
      googleId: profile.googleId,
      role: ManagerRole.OWNER,
    },
  });
}
