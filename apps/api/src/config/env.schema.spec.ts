import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.schema";

describe("validateEnv", () => {
  const baseEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    AUTH_JWT_ACCESS_SECRET: "a".repeat(32),
    AUTH_JWT_REFRESH_SECRET: "b".repeat(32),
  };

  it("applies defaults for a minimal valid environment", () => {
    const result = validateEnv(baseEnv);

    expect(result.NODE_ENV).toBe("development");
    expect(result.PORT).toBe(3000);
    expect(result.CORS_ORIGINS).toBe("");
    expect(result.STORAGE_PROVIDER).toBe("local");
    expect(result.AUTH_JWT_ACCESS_TTL).toBe("15m");
  });

  it("coerces PORT from a string", () => {
    const result = validateEnv({ ...baseEnv, PORT: "4000" });

    expect(result.PORT).toBe(4000);
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => validateEnv({ ...baseEnv, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("throws when an auth secret is missing or too short", () => {
    expect(() => validateEnv({ ...baseEnv, AUTH_JWT_ACCESS_SECRET: undefined })).toThrow(
      /AUTH_JWT_ACCESS_SECRET/,
    );
    expect(() => validateEnv({ ...baseEnv, AUTH_JWT_REFRESH_SECRET: "too-short" })).toThrow(
      /AUTH_JWT_REFRESH_SECRET/,
    );
  });

  it("throws on an invalid NODE_ENV", () => {
    expect(() => validateEnv({ ...baseEnv, NODE_ENV: "staging" })).toThrow();
  });

  it("throws on an invalid STORAGE_PROVIDER", () => {
    expect(() => validateEnv({ ...baseEnv, STORAGE_PROVIDER: "gcs" })).toThrow();
  });

  it("passes through optional storage placeholders when provided", () => {
    const result = validateEnv({ ...baseEnv, STORAGE_BUCKET: "product-images" });

    expect(result.STORAGE_BUCKET).toBe("product-images");
  });
});
