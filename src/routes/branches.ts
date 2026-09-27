import { Router } from "express";
import { HttpError } from "../lib/http-error.ts";
import { requireAuth } from "../middleware/require-auth.ts";
import {
  createBranch,
  deleteBranch,
  listBranches,
  updateBranch,
} from "../services/branch-service.ts";

export const branchesRouter = Router();

function organizationId(requestOrganizationId: string | null | undefined): string {
  if (!requestOrganizationId) {
    throw new HttpError(400, "Create your restaurant before managing branches.");
  }

  return requestOrganizationId;
}

branchesRouter.use(requireAuth);

branchesRouter.get("/", async (request, response, next) => {
  try {
    const branches = await listBranches(
      organizationId(request.manager?.organizationId),
    );
    response.json(branches);
  } catch (error) {
    next(error);
  }
});

branchesRouter.post("/", async (request, response, next) => {
  try {
    const branch = await createBranch(
      organizationId(request.manager?.organizationId),
      request.body,
    );
    response.status(201).json(branch);
  } catch (error) {
    next(error);
  }
});

branchesRouter.patch("/:id", async (request, response, next) => {
  try {
    const branchId = request.params.id;

    if (typeof branchId !== "string" || branchId.length === 0) {
      throw new HttpError(400, "That branch was not found.");
    }

    const branch = await updateBranch(
      organizationId(request.manager?.organizationId),
      branchId,
      request.body,
    );
    response.json(branch);
  } catch (error) {
    next(error);
  }
});

branchesRouter.delete("/:id", async (request, response, next) => {
  try {
    const branchId = request.params.id;

    if (typeof branchId !== "string" || branchId.length === 0) {
      throw new HttpError(400, "That branch was not found.");
    }

    await deleteBranch(
      organizationId(request.manager?.organizationId),
      branchId,
    );
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
