import { z } from "zod";
import { paginationQuerySchema } from "./pagination";
import { slugSchema } from "./category";

export const productStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

/** Decimal amounts travel as strings end-to-end -- never a JS number -- to avoid floating-point money. */
const decimalStringSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Must be a decimal amount with up to 2 decimal places");

export const createProductImageSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  altText: z.string().trim().max(300).optional(),
  position: z.coerce.number().int().min(0).optional(),
  isPrimary: z.coerce.boolean().optional(),
  /** When set, this photo is specific to one of the product's variants. */
  variantId: z.string().uuid().optional(),
});
export type CreateProductImageInput = z.infer<typeof createProductImageSchema>;

export const updateProductImageSchema = createProductImageSchema.partial();
export type UpdateProductImageInput = z.infer<typeof updateProductImageSchema>;

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    slug: slugSchema,
    description: z.string().trim().max(5000).optional(),
    sku: z.string().trim().min(1, "SKU is required").max(64),
    price: decimalStringSchema,
    salePrice: decimalStringSchema.optional(),
    currency: z.string().trim().length(3).toUpperCase().default("USD"),
    status: productStatusSchema.default("DRAFT"),
    categoryId: z.string().uuid().optional(),
    images: z.array(createProductImageSchema).max(20).optional(),
    /** Starting `quantityAvailable`; reserved always starts at 0 -- nothing can be reserved before the product exists. */
    initialQuantity: z.coerce.number().int().min(0).default(0),
  })
  .refine((data) => !data.salePrice || Number(data.salePrice) < Number(data.price), {
    message: "salePrice must be less than price",
    path: ["salePrice"],
  });
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200).optional(),
    slug: slugSchema.optional(),
    description: z.string().trim().max(5000).optional(),
    sku: z.string().trim().min(1, "SKU is required").max(64).optional(),
    price: decimalStringSchema.optional(),
    salePrice: decimalStringSchema.optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    status: productStatusSchema.optional(),
    categoryId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => !data.salePrice || !data.price || Number(data.salePrice) < Number(data.price), {
    message: "salePrice must be less than price",
    path: ["salePrice"],
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** e.g. `{ color: "Red", size: "M" }` -- plain key/value strings, 1-10 entries. See docs/database.md's "Product variants". */
export const productVariantAttributesSchema = z
  .record(z.string().trim().min(1).max(50), z.string().trim().min(1).max(100))
  .refine((attributes) => Object.keys(attributes).length > 0, {
    message: "At least one attribute is required",
  })
  .refine((attributes) => Object.keys(attributes).length <= 10, {
    message: "At most 10 attributes are allowed",
  });

export const createProductVariantSchema = z
  .object({
    sku: z.string().trim().min(1, "SKU is required").max(64),
    price: decimalStringSchema,
    salePrice: decimalStringSchema.optional(),
    currency: z.string().trim().length(3).toUpperCase().default("USD"),
    attributes: productVariantAttributesSchema,
    status: productStatusSchema.default("ACTIVE"),
    /** Starting `quantityAvailable`; reserved always starts at 0. */
    initialQuantity: z.coerce.number().int().min(0).default(0),
  })
  .refine((data) => !data.salePrice || Number(data.salePrice) < Number(data.price), {
    message: "salePrice must be less than price",
    path: ["salePrice"],
  });
export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;

export const updateProductVariantSchema = z
  .object({
    sku: z.string().trim().min(1, "SKU is required").max(64).optional(),
    price: decimalStringSchema.optional(),
    salePrice: decimalStringSchema.optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    attributes: productVariantAttributesSchema.optional(),
    status: productStatusSchema.optional(),
  })
  .refine((data) => !data.salePrice || !data.price || Number(data.salePrice) < Number(data.price), {
    message: "salePrice must be less than price",
    path: ["salePrice"],
  });
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;

export const productQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  status: productStatusSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

export const adjustInventorySchema = z.object({
  quantityAvailable: z.coerce.number().int().min(0).optional(),
  quantityReserved: z.coerce.number().int().min(0).optional(),
  /** Required -- the optimistic-concurrency guard against Inventory.version. See docs/database.md. */
  version: z.coerce.number().int().min(0),
});
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
