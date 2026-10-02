import type { CookieOptions, Request } from "express";
import type { AppConfigService } from "../config/app-config.service";

export const GUEST_CART_TOKEN_COOKIE = "guest_cart_token";

/**
 * How a mobile client (no cookie jar) sends its guest cart token back --
 * the same per-platform transport split auth uses for its tokens.
 */
export const GUEST_CART_TOKEN_HEADER = "x-guest-cart-token";

/**
 * Not an auth/session credential -- just an opaque identifier for an
 * anonymous cart, so it's readable by every API route (needed by
 * AuthController to merge a guest cart on login/register) rather than
 * scoped to /cart the way the refresh token cookie is scoped to /auth.
 */
export function buildGuestCartCookieOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
}

/** The caller's guest cart token: the cookie (web) or the header (mobile). */
export function readGuestCartToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[GUEST_CART_TOKEN_COOKIE] as string | undefined;
  const fromHeader = req.headers[GUEST_CART_TOKEN_HEADER];
  return fromCookie || (typeof fromHeader === "string" && fromHeader ? fromHeader : undefined);
}
