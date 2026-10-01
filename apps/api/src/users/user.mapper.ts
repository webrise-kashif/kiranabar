import type { PublicUser } from "@kiranabar/types";
import type { User } from "@prisma/client";

/** Strips passwordHash and shapes a Prisma User for any API response. */
export function toPublicUser(user: Omit<User, "passwordHash"> | User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
