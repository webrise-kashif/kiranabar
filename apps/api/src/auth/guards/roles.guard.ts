import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PublicUser, UserRole } from "@kiranabar/types";
import { ROLES_KEY } from "../decorators/roles.decorator";

/**
 * Registered globally (see AuthModule), alongside JwtAuthGuard. A no-op
 * unless the route carries `@Roles(...)`. Relies on `request.user` already
 * being populated -- JwtAuthGuard must run first.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: PublicUser }>();

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException("You do not have permission to access this resource");
    }

    return true;
  }
}
