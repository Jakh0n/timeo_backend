import { Router } from "express";
import rateLimit from "express-rate-limit";
import { HttpError } from "../lib/http-error.ts";
import {
  getMySchedule,
  getOwnSubmission,
  getPublicShiftLink,
  submitAvailability,
} from "../services/public-shift-service.ts";

function linkToken(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(404, "This link doesn't match a schedule.");
  }

  return value;
}

const submitLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many attempts. Wait a minute and try again.",
  },
});

const lookupLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many attempts. Wait a minute and try again.",
  },
});

export const publicShiftRequirementsRouter = Router();

publicShiftRequirementsRouter.get("/:linkToken", async (request, response, next) => {
  try {
    const link = await getPublicShiftLink(linkToken(request.params.linkToken));
    response.json(link);
  } catch (error) {
    next(error);
  }
});

publicShiftRequirementsRouter.get(
  "/:linkToken/submission",
  lookupLimit,
  async (request, response, next) => {
    try {
      const submission = await getOwnSubmission(
        linkToken(request.params.linkToken),
        request.query.employeeId,
      );
      response.json(submission);
    } catch (error) {
      next(error);
    }
  },
);

publicShiftRequirementsRouter.get(
  "/:linkToken/my-schedule",
  lookupLimit,
  async (request, response, next) => {
    try {
      const schedule = await getMySchedule(
        linkToken(request.params.linkToken),
        request.query.employeeId,
      );
      response.json(schedule);
    } catch (error) {
      next(error);
    }
  },
);

publicShiftRequirementsRouter.post(
  "/:linkToken/submit",
  submitLimit,
  async (request, response, next) => {
    try {
      await submitAvailability(linkToken(request.params.linkToken), request.body);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
