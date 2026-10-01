import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  Category,
  CategoryStatus,
  CategoryWithChildren,
  PaginatedResult,
} from "@kiranabar/types";
import type {
  CategoryQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@kiranabar/validation";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { toCategory, toCategoryWithChildren } from "./category.mapper";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCategoryInput): Promise<Category> {
    if (input.parentId) {
      await this.assertExists(input.parentId);
    }

    try {
      const category = await this.prisma.category.create({ data: input });
      return toCategory(category);
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async findMany(
    query: CategoryQuery,
    includeAllStatuses: boolean,
  ): Promise<PaginatedResult<Category>> {
    const { page, pageSize, parentId } = query;
    const statusFilter: CategoryStatus | undefined = includeAllStatuses ? query.status : "ACTIVE";

    const where: Prisma.CategoryWhereInput = {
      ...(parentId ? { parentId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.category.count({ where }),
    ]);

    return { items: items.map(toCategory), total, page, pageSize };
  }

  async findOne(idOrSlug: string, includeAllStatuses: boolean): Promise<CategoryWithChildren> {
    const category = await this.prisma.category.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: { children: true },
    });

    if (!category || (!includeAllStatuses && category.status !== "ACTIVE")) {
      throw new NotFoundException("Category not found");
    }

    const visibleChildren = includeAllStatuses
      ? category.children
      : category.children.filter((child) => child.status === "ACTIVE");

    return toCategoryWithChildren({ ...category, children: visibleChildren });
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    await this.assertExists(id);

    if (input.parentId) {
      if (input.parentId === id) {
        throw new ConflictException("A category cannot be its own parent");
      }
      await this.assertExists(input.parentId);
    }

    try {
      const category = await this.prisma.category.update({ where: { id }, data: input });
      return toCategory(category);
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  /** Soft delete: sets status to ARCHIVED rather than removing the row -- see docs/database.md. */
  async archive(id: string): Promise<Category> {
    await this.assertExists(id);
    const category = await this.prisma.category.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    return toCategory(category);
  }

  /**
   * Hard delete: only ever allowed once a category is already archived, and
   * still blocked by the DB if it has child categories (`Category.parent` is
   * `onDelete: Restrict` -- see schema.prisma). Products referencing it have
   * their categoryId set to null.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existing) {
      throw new NotFoundException("Category not found");
    }

    if (existing.status !== "ARCHIVED") {
      throw new ConflictException("Category must be archived before it can be deleted");
    }

    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (error) {
      this.rethrowDeleteError(error);
    }
  }

  /** Used by other modules (e.g. Products) to validate a categoryId reference without reaching into Prisma directly. */
  async exists(id: string): Promise<boolean> {
    const category = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    return !!category;
  }

  private async assertExists(id: string): Promise<void> {
    if (!(await this.exists(id))) {
      throw new NotFoundException("Category not found");
    }
  }

  private rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("A category with this slug already exists");
    }
    throw error as Error;
  }

  private rethrowDeleteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ConflictException(
        "Category cannot be deleted because it still has child categories",
      );
    }
    throw error as Error;
  }
}
