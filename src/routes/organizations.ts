import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.ts";
import { createOrganizationForManager } from "../services/organization-service.ts";

export const organizationsRouter = Router();

organizationsRouter.post("/", requireAuth, async (request, response, next) => {
  try {
    if (!request.manager) {
      response.status(401).json({ message: "You need to log in." });
      return;
    }

    const organization = await createOrganizationForManager(
      request.manager.id,
      request.body,
    );
    response.status(201).json(organization);
  } catch (error) {
    next(error);
  }
});
