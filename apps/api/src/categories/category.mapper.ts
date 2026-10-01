import type { Category, CategoryWithChildren } from "@kiranabar/types";
import type { Category as PrismaCategory } from "@prisma/client";

export function toCategory(category: PrismaCategory): Category {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    status: category.status,
    parentId: category.parentId,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export function toCategoryWithChildren(
  category: PrismaCategory & { children: PrismaCategory[] },
): CategoryWithChildren {
  return { ...toCategory(category), children: category.children.map(toCategory) };
}
