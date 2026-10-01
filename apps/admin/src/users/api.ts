import type { PublicUser, UserRole } from "@kiranabar/types";
import { apiClient } from "../lib/api-client";

/** SUPER_ADMIN only, enforced by the backend -- see docs/api-contract.md. */
export function changeUserRole(id: string, role: UserRole): Promise<PublicUser> {
  return apiClient.patch<PublicUser>(`/users/${id}/role`, { role });
}
