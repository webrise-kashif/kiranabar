import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { StringValue } from "ms";
import type { Env } from "./env.schema";

/**
 * Typed facade over @nestjs/config's ConfigService so the rest of the app
 * never reads `process.env` or an untyped string key directly.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  get nodeEnv(): Env["NODE_ENV"] {
    return this.configService.get("NODE_ENV", { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  get port(): number {
    return this.configService.get("PORT", { infer: true });
  }

  get databaseUrl(): string {
    return this.configService.get("DATABASE_URL", { infer: true });
  }

  get corsOrigins(): string[] {
    return this.configService
      .get("CORS_ORIGINS", { infer: true })
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get auth(): {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    // Typed as `ms`'s StringValue (what @nestjs/jwt's signOptions.expiresIn
    // expects), not a plain string -- safe because env.schema.ts's regex
    // already restricts these to the exact duration shapes StringValue
    // accepts (e.g. "15m", "30d").
    accessTokenTtl: StringValue;
    refreshTokenTtl: StringValue;
  } {
    return {
      accessTokenSecret: this.configService.get("AUTH_JWT_ACCESS_SECRET", { infer: true }),
      refreshTokenSecret: this.configService.get("AUTH_JWT_REFRESH_SECRET", { infer: true }),
      accessTokenTtl: this.configService.get("AUTH_JWT_ACCESS_TTL", { infer: true }) as StringValue,
      refreshTokenTtl: this.configService.get("AUTH_JWT_REFRESH_TTL", {
        infer: true,
      }) as StringValue,
    };
  }

  /** Placeholders for future file/image storage -- unused until it's implemented. */
  get storage(): {
    provider: Env["STORAGE_PROVIDER"];
    bucket: string | undefined;
    region: string | undefined;
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    endpoint: string | undefined;
  } {
    return {
      provider: this.configService.get("STORAGE_PROVIDER", { infer: true }),
      bucket: this.configService.get("STORAGE_BUCKET", { infer: true }),
      region: this.configService.get("STORAGE_REGION", { infer: true }),
      accessKeyId: this.configService.get("STORAGE_ACCESS_KEY_ID", { infer: true }),
      secretAccessKey: this.configService.get("STORAGE_SECRET_ACCESS_KEY", { infer: true }),
      endpoint: this.configService.get("STORAGE_ENDPOINT", { infer: true }),
    };
  }
}
