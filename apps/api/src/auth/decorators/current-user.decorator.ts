import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { PublicUser } from "@kiranabar/types";

/** The authenticated caller, as populated by JwtStrategy. Only valid behind JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicUser => {
    const request = ctx.switchToHttp().getRequest<{ user: PublicUser }>();
    return request.user;
  },
);
