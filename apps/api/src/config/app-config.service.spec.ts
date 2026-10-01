import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { AppConfigService } from "./app-config.service";
import type { Env } from "./env.schema";

function buildService(overrides: Partial<Env> = {}): AppConfigService {
  const env: Env = {
    NODE_ENV: "development",
    PORT: 3000,
    DATABASE_URL: "postgresql://localhost:5432/db",
    CORS_ORIGINS: "",
    AUTH_JWT_ACCESS_SECRET: "a".repeat(32),
    AUTH_JWT_REFRESH_SECRET: "b".repeat(32),
    AUTH_JWT_ACCESS_TTL: "15m",
    AUTH_JWT_REFRESH_TTL: "30d",
    STORAGE_PROVIDER: "local",
    ...overrides,
  };

  return new AppConfigService(new ConfigService(env));
}

describe("AppConfigService", () => {
  it("parses a comma-separated CORS_ORIGINS into a trimmed list", () => {
    const service = buildService({
      CORS_ORIGINS: "http://localhost:3001, http://localhost:5173",
    });

    expect(service.corsOrigins).toEqual(["http://localhost:3001", "http://localhost:5173"]);
  });

  it("returns an empty array when CORS_ORIGINS is unset", () => {
    expect(buildService({ CORS_ORIGINS: "" }).corsOrigins).toEqual([]);
  });

  it("derives isProduction from NODE_ENV", () => {
    expect(buildService({ NODE_ENV: "production" }).isProduction).toBe(true);
    expect(buildService({ NODE_ENV: "development" }).isProduction).toBe(false);
  });

  it("exposes the database URL and port as typed values", () => {
    const service = buildService({
      DATABASE_URL: "postgresql://user:pass@db:5432/ecommerce",
      PORT: 4000,
    });

    expect(service.databaseUrl).toBe("postgresql://user:pass@db:5432/ecommerce");
    expect(service.port).toBe(4000);
  });

  it("exposes auth and storage configuration", () => {
    const service = buildService({ STORAGE_BUCKET: "product-images" });

    expect(service.auth.accessTokenSecret).toBe("a".repeat(32));
    expect(service.auth.accessTokenTtl).toBe("15m");
    expect(service.storage.bucket).toBe("product-images");
    expect(service.storage.provider).toBe("local");
  });
});
