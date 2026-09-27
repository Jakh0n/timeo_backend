import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../lib/http-error.ts";

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (response.headersSent) {
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({ message: error.message });
    return;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    response.status(409).json({
      message: "An account with this email already exists.",
    });
    return;
  }

  console.error(error);
  response.status(500).json({ message: "Something went wrong. Try again." });
}
