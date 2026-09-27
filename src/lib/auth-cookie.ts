import type { CookieOptions, Response } from "express";

export const AUTH_COOKIE_NAME = "token";

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export function authCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    path: "/",
    maxAge: WEEK_IN_MS,
    // Production (Vercel + Render) is cross-site, so the cookie must be
    // SameSite=None; Secure. Local dev is same-site http, so Lax is enough.
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    ...(process.env.COOKIE_DOMAIN
      ? { domain: process.env.COOKIE_DOMAIN }
      : {}),
  };
}

export function setAuthCookie(response: Response, token: string): void {
  response.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
}

export function clearAuthCookie(response: Response): void {
  const { maxAge: _maxAge, ...options } = authCookieOptions();
  response.clearCookie(AUTH_COOKIE_NAME, options);
}
