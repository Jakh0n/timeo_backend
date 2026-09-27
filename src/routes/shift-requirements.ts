import { Router } from "express";
import { HttpError } from "../lib/http-error.ts";
import { requireAuth } from "../middleware/require-auth.ts";
import { generateShiftRequirement } from "../services/generate-schedule-service.ts";
import {
  createShiftRequirement,
  getShiftRequirement,
  listShiftRequirements,
  startCollecting,
} from "../services/shift-requirement-service.ts";

export const shiftRequirementsRouter = Router();

function organizationId(requestOrganizationId: string | null | undefined): string {
  if (!requestOrganizationId) {
    throw new HttpError(
      400,
      "Create your restaurant before managing shift requirements.",
    );
  }

  return requestOrganizationId;
}

function requirementId(value: string | undefined): string {
  if (!value) {
    throw new HttpError(400, "That shift requirement was not found.");
  }

  return value;
}

shiftRequirementsRouter.use(requireAuth);

shiftRequirementsRouter.get("/", async (request, response, next) => {
  try {
    const requirements = await listShiftRequirements(
      organizationId(request.manager?.organizationId),
    );
    response.json(requirements);
  } catch (error) {
    next(error);
  }
});

shiftRequirementsRouter.post("/", async (request, response, next) => {
  try {
    const requirement = await createShiftRequirement(
      organizationId(request.manager?.organizationId),
      request.body,
    );
    response.status(201).json(requirement);
  } catch (error) {
    next(error);
  }
});

shiftRequirementsRouter.get("/:id", async (request, response, next) => {
  try {
    const requirement = await getShiftRequirement(
      organizationId(request.manager?.organizationId),
      requirementId(request.params.id),
    );
    response.json(requirement);
  } catch (error) {
    next(error);
  }
});

shiftRequirementsRouter.post("/:id/generate", async (request, response, next) => {
  try {
    const result = await generateShiftRequirement(
      organizationId(request.manager?.organizationId),
      requirementId(request.params.id),
    );
    response.json(result);
  } catch (error) {
    next(error);
  }
});

shiftRequirementsRouter.post("/:id/collect", async (request, response, next) => {
  try {
    const requirement = await startCollecting(
      organizationId(request.manager?.organizationId),
      requirementId(request.params.id),
    );
    response.json(requirement);
  } catch (error) {
    next(error);
  }
});
