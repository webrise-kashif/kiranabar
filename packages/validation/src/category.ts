import { z } from "zod";
import { paginationQuerySchema } from "./pagination";

export const categoryStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Slug is required")
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only");

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional(),
  status: categoryStatusSchema.default("DRAFT"),
  parentId: z.string().uuid().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categoryQuerySchema = paginationQuerySchema.extend({
  parentId: z.string().uuid().optional(),
  status: categoryStatusSchema.optional(),
});
export type CategoryQuery = z.infer<typeof categoryQuerySchema>;
