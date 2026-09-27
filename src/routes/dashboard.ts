import { Router } from "express";
import { HttpError } from "../lib/http-error.ts";
import { requireAuth } from "../middleware/require-auth.ts";
import { getDashboardOverview } from "../services/dashboard-service.ts";

export const dashboardRouter = Router();

dashboardRouter.get("/overview", requireAuth, async (request, response, next) => {
  try {
    const organizationId = request.manager?.organizationId;

    if (!organizationId) {
      throw new HttpError(400, "Create your restaurant before opening the dashboard.");
    }

    const overview = await getDashboardOverview(organizationId);
    response.json(overview);
  } catch (error) {
    next(error);
  }
});
