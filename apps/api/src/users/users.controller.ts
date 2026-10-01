import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import type { PaginatedResult, PublicUser } from "@kiranabar/types";
import { Roles } from "../auth/decorators/roles.decorator";
import { ChangeUserRoleDto } from "./dto/change-role.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles("ADMIN", "SUPER_ADMIN")
  @Get()
  list(@Query() query: ListUsersQueryDto): Promise<PaginatedResult<PublicUser>> {
    return this.usersService.list(query);
  }

  /** Elevated: only SUPER_ADMIN may change another user's role. */
  @Roles("SUPER_ADMIN")
  @Patch(":id/role")
  changeRole(@Param("id") id: string, @Body() dto: ChangeUserRoleDto): Promise<PublicUser> {
    return this.usersService.updateRole(id, dto.role);
  }
}
