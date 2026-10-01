import type { PublicUser, UserRole } from "@kiranabar/types";

const STAFF_ROLES: ReadonlySet<UserRole> = new Set(["ADMIN", "SUPER_ADMIN"]);

/** True for a logged-in ADMIN or SUPER_ADMIN -- used by public, role-aware catalog endpoints. */
export function isStaff(user: PublicUser | undefined): boolean {
  return !!user && STAFF_ROLES.has(user.role);
}
