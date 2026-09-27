import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

export const app = express();

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
