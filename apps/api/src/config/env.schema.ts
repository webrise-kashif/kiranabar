import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Comma-separated list of allowed browser origins. Only relevant to the two
  // browser clients (Web Store, Admin Portal) -- the future React Native app
  // isn't subject to CORS.
  CORS_ORIGINS: z.string().default(""),

  // Signing secrets for access vs. refresh tokens are deliberately distinct
  // -- a leaked access-token secret must not also compromise refresh
  // tokens. Both are required: there is no safe default for a secret.
  AUTH_JWT_ACCESS_SECRET: z
    .string()
    .min(32, "AUTH_JWT_ACCESS_SECRET must be at least 32 characters"),
  AUTH_JWT_REFRESH_SECRET: z
    .string()
    .min(32, "AUTH_JWT_REFRESH_SECRET must be at least 32 characters"),
  // Matches the subset of `ms`-style durations this app actually uses (see
  // apps/api/src/auth/duration.util.ts, which parses this same shape).
  AUTH_JWT_ACCESS_TTL: z
    .string()
    .regex(/^\d+(ms|s|m|h|d)$/, 'Expected a duration like "15m" or "30d"')
    .default("15m"),
  AUTH_JWT_REFRESH_TTL: z
    .string()
    .regex(/^\d+(ms|s|m|h|d)$/, 'Expected a duration like "15m" or "30d"')
    .default("30d"),

  // Not consumed anywhere yet -- for future product image / file uploads.
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Passed to `ConfigModule.forRoot({ validate })` -- runs once at startup so a
 * misconfigured environment fails fast instead of surfacing as a runtime
 * error deep inside a request handler.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
