import type { NextFunction, Request, Response } from "express";
import type { ManagerUser } from "../generated/prisma/client.ts";
import { AUTH_COOKIE_NAME } from "../lib/auth-cookie.ts";
import { HttpError } from "../lib/http-error.ts";
import { readUserIdFromToken } from "../lib/jwt.ts";
import { prisma } from "../lib/prisma.ts";

declare global {
  namespace Express {
    interface User extends ManagerUser {}

    interface Request {
      manager?: ManagerUser;
    }
  }
}

export async function requireAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const token = request.cookies[AUTH_COOKIE_NAME];

  if (typeof token !== "string" || token.length === 0) {
    next(new HttpError(401, "You need to log in."));
    return;
  }

  const userId = readUserIdFromToken(token);

  if (!userId) {
    next(new HttpError(401, "You need to log in."));
    return;
  }

  const manager = await prisma.managerUser.findUnique({
    where: { id: userId },
  });

  if (!manager) {
    next(new HttpError(401, "You need to log in."));
    return;
  }

  request.manager = manager;
  next();
}
