import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { Category, CategoryWithChildren, PaginatedResult, PublicUser } from "@kiranabar/types";
import { OptionalUser } from "../auth/decorators/optional-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { isStaff } from "../auth/is-staff.util";
import { CategoriesService } from "./categories.service";
import { CategoryQueryDto } from "./dto/category-query.dto";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /** Public: anonymous/CUSTOMER callers see ACTIVE only; ADMIN/SUPER_ADMIN see everything. */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(
    @Query() query: CategoryQueryDto,
    @OptionalUser() user: PublicUser | undefined,
  ): Promise<PaginatedResult<Category>> {
    return this.categoriesService.findMany(query, isStaff(user));
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":idOrSlug")
  findOne(
    @Param("idOrSlug") idOrSlug: string,
    @OptionalUser() user: PublicUser | undefined,
  ): Promise<CategoryWithChildren> {
    return this.categoriesService.findOne(idOrSlug, isStaff(user));
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Post()
  create(@Body() dto: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(dto);
  }

  @Roles("ADMIN", "SUPER_ADMIN")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCategoryDto): Promise<Category> {
    return this.categoriesService.update(id, dto);
  }

  /** Soft delete -- sets status to ARCHIVED. See docs/database.md. */
  @Roles("ADMIN", "SUPER_ADMIN")
  @Delete(":id")
  archive(@Param("id") id: string): Promise<Category> {
    return this.categoriesService.archive(id);
  }

  /** Hard delete -- only allowed once the category is already ARCHIVED. See docs/architecture.md. */
  @Roles("ADMIN", "SUPER_ADMIN")
  @Delete(":id/permanent")
  async remove(@Param("id") id: string): Promise<{ success: true }> {
    await this.categoriesService.remove(id);
    return { success: true };
  }
}
