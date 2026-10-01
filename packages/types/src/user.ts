/**
 * Mirrors the `Role` enum in apps/api/prisma/schema.prisma. Kept as a plain
 * union here (not generated from Prisma) because packages/types must stay
 * framework/runtime-independent -- it can never depend on @prisma/client,
 * which is backend-only. Three values, rarely changing: not worth codegen.
 */
export type UserRole = "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";

/**
 * The user shape every client is allowed to see. Never includes
 * `passwordHash` or any token/session material.
 */
export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}
