import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import passport from "passport";
import { configurePassport } from "./lib/passport.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { authRouter } from "./routes/auth.ts";
import { branchesRouter } from "./routes/branches.ts";
import { dashboardRouter } from "./routes/dashboard.ts";
import { organizationsRouter } from "./routes/organizations.ts";
import { shiftRequirementsRouter } from "./routes/shift-requirements.ts";

const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

configurePassport();

export const app = express();

app.set("trust proxy", 1);
app.use(express.json());

// Production runs the frontend (Vercel) and this API (Render) on different
// domains. Auth cookies must be set with SameSite=None; Secure, and this
// CORS config must keep credentials enabled so the browser will send them.
app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(passport.initialize());
app.use("/api/auth", authRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/shift-requirements", shiftRequirementsRouter);
app.use(errorHandler);
