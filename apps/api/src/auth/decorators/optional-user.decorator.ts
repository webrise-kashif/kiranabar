import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { PublicUser } from "@kiranabar/types";

/** The authenticated caller if one is present, or undefined -- pairs with OptionalJwtAuthGuard. */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: PublicUser }>();
    return request.user;
  },
);
