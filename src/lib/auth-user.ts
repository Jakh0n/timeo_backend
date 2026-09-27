import type { ManagerRole, ManagerUser } from "../generated/prisma/client.ts";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: ManagerRole;
  hasOrganization: boolean;
};

export function toAuthUser(user: ManagerUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasOrganization: user.organizationId !== null,
  };
}
