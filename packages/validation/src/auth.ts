import { z } from "zod";

/**
 * Shared between the backend's registration/login DTOs and the frontend
 * forms that collect this input -- one source of truth for what a valid
 * email/password looks like.
 */
export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

/**
 * Length-only, no forced complexity rules (uppercase/number/symbol) --
 * follows current NIST 800-63B guidance that length matters more than
 * composition rules, which mostly just push users toward predictable
 * substitutions. 128 caps hashing cost on an intentionally long input.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Intentionally not re-validated against passwordSchema's rules here --
  // an existing password that predates a rule change must still be able to
  // log in. Only presence is required.
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Sent by mobile clients (which have no cookie jar) to identify which refresh token to revoke/rotate. */
export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshTokenBody = z.infer<typeof refreshTokenBodySchema>;

export const userRoleSchema = z.enum(["CUSTOMER", "ADMIN", "SUPER_ADMIN"]);

export const changeUserRoleSchema = z.object({
  role: userRoleSchema,
});
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;
