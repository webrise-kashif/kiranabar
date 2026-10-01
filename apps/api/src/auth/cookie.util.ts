import type { CookieOptions } from "express";
import type { AppConfigService } from "../config/app-config.service";
import { parseDurationMs } from "./duration.util";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

/**
 * Needed on every request, so scoped to the whole API.
 */
export function buildAccessTokenCookieOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: parseDurationMs(config.auth.accessTokenTtl),
  };
}

/**
 * Only ever read by /api/v1/auth/refresh and /api/v1/auth/logout -- scoping
 * the cookie's path away from every other route reduces its exposure (e.g.
 * to an XSS-triggered request against an unrelated endpoint).
 */
export function buildRefreshTokenCookieOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: parseDurationMs(config.auth.refreshTokenTtl),
  };
}
