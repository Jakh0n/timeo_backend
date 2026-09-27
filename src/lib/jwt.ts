import jwt from "jsonwebtoken";
import { HttpError } from "./http-error.ts";

const TOKEN_TTL = "7d";

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new HttpError(500, "Sign-in is not configured.");
  }

  return secret;
}

export function signAuthToken(userId: string): string {
  return jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: TOKEN_TTL });
}

export function readUserIdFromToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, jwtSecret());

    if (
      typeof payload === "object" &&
      payload !== null &&
      "sub" in payload &&
      typeof payload.sub === "string"
    ) {
      return payload.sub;
    }
  } catch {
    return null;
  }

  return null;
}
