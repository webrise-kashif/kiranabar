import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@kiranabar/types";

export const ROLES_KEY = "roles";

/** Requires the caller's role to be one of `roles`. Requires RolesGuard (registered globally). */
export const Roles = (...roles: UserRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
