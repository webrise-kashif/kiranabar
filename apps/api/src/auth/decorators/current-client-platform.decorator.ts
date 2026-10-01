import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export type ClientPlatform = "web" | "mobile";

/**
 * Determines auth response shape: "web" clients (Web Store, Admin Portal)
 * get tokens only as httpOnly cookies; "mobile" clients (no cookie jar)
 * get them in the JSON body, to store in secure device storage. Defaults
 * to "web" -- the safer behavior -- for any missing or unrecognized value.
 */
export const CurrentClientPlatform = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientPlatform => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.headers["x-client-platform"] === "mobile" ? "mobile" : "web";
  },
);
