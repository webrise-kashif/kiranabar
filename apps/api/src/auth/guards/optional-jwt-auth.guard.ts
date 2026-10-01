import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { PublicUser } from "@kiranabar/types";

/**
 * Like JwtAuthGuard, but never rejects the request -- used on public,
 * role-aware catalog endpoints (e.g. product/category browsing) where an
 * anonymous caller is allowed through with `request.user` left undefined,
 * while a valid token still populates it so the handler can offer more to
 * a logged-in admin. Must be paired with `@Public()` (it bypasses the
 * global JwtAuthGuard, this one takes over instead) -- see
 * `docs/authentication.md`.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  override handleRequest<T = PublicUser>(_err: unknown, user: T | false): T | undefined {
    return user ? user : undefined;
  }
}
