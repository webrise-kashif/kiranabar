import type { UserRole } from "@kiranabar/types";

export interface JwtPayload {
  sub: string;
  role: UserRole;
}
