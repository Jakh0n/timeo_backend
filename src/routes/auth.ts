import { Router } from "express";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { setAuthCookie, clearAuthCookie } from "../lib/auth-cookie.ts";
import { toAuthUser } from "../lib/auth-user.ts";
import { signAuthToken } from "../lib/jwt.ts";
import { googleAuthConfigured } from "../lib/passport.ts";
import { HttpError } from "../lib/http-error.ts";
import { requireAuth } from "../middleware/require-auth.ts";
import {
  loginManager,
  parseLoginBody,
  parseSignupBody,
  signupManager,
} from "../services/auth-service.ts";

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many attempts. Wait a few minutes and try again.",
  },
});

function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export const authRouter = Router();

authRouter.post("/signup", authRateLimit, async (request, response, next) => {
  try {
    const user = await signupManager(parseSignupBody(request.body));
    setAuthCookie(response, signAuthToken(user.id));
    response.status(201).json({ hasOrganization: false });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", authRateLimit, async (request, response, next) => {
  try {
    const user = await loginManager(parseLoginBody(request.body));
    setAuthCookie(response, signAuthToken(user.id));
    response.json({ hasOrganization: user.hasOrganization });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/google", (request, response, next) => {
  if (!googleAuthConfigured()) {
    next(new HttpError(500, "Google sign-in is not configured yet."));
    return;
  }

  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(request, response, next);
});

authRouter.get(
  "/google/callback",
  (request, response, next) => {
    if (!googleAuthConfigured()) {
      response.redirect(`${frontendUrl()}/login?error=google`);
      return;
    }

    passport.authenticate("google", {
      session: false,
      failureRedirect: `${frontendUrl()}/login?error=google`,
    })(request, response, next);
  },
  (request, response) => {
    const user = request.user;

    if (!user) {
      response.redirect(`${frontendUrl()}/login?error=google`);
      return;
    }

    setAuthCookie(response, signAuthToken(user.id));
    const destination = user.organizationId ? "/dashboard" : "/onboarding";
    response.redirect(302, `${frontendUrl()}${destination}`);
  },
);

authRouter.get("/me", requireAuth, (request, response) => {
  if (!request.manager) {
    response.status(401).json({ message: "You need to log in." });
    return;
  }

  response.json(toAuthUser(request.manager));
});

authRouter.post("/logout", (request, response) => {
  clearAuthCookie(response);
  response.status(204).send();
});
