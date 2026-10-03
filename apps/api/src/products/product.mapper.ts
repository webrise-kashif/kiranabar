import type { Product, ProductImage as ProductImageType, ProductVariant } from "@kiranabar/types";
import type {
  Category,
  Inventory,
  Product as PrismaProduct,
  ProductImage as PrismaProductImage,
  ProductVariant as PrismaProductVariant,
} from "@prisma/client";
import { toInventory } from "../inventory/inventory.mapper";

export const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  images: true,
  inventory: true,
  variants: { include: { inventory: true, images: true } },
} as const;

/**
 * For a non-staff caller: the same shape, but only ACTIVE variants -- a
 * DRAFT/ARCHIVED variant is as hidden from the public as a DRAFT/ARCHIVED
 * product (see ProductsService.findOne/findMany).
 */
export const PUBLIC_PRODUCT_INCLUDE = {
  ...PRODUCT_INCLUDE,
  variants: { where: { status: "ACTIVE" }, include: { inventory: true, images: true } },
} as const;

type ProductWithRelations = PrismaProduct & {
  category: Pick<Category, "id" | "name" | "slug"> | null;
  images: PrismaProductImage[];
  inventory: Inventory | null;
  variants: ProductVariantWithRelations[];
};

type ProductVariantWithRelations = PrismaProductVariant & {
  images: PrismaProductImage[];
  inventory: Inventory | null;
};

export function toProductImage(image: PrismaProductImage): ProductImageType {
  return {
    id: image.id,
    url: image.url,
    altText: image.altText,
    position: image.position,
    isPrimary: image.isPrimary,
    variantId: image.variantId,
  };
}

export function toProductVariant(variant: ProductVariantWithRelations): ProductVariant {
  return {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    // .toFixed(2), not .toString() -- see the equivalent comment on toProduct below.
    price: variant.price.toFixed(2),
    salePrice: variant.salePrice?.toFixed(2) ?? null,
    currency: variant.currency,
    // Written only via productVariantAttributesSchema (packages/validation),
    // which guarantees a flat string-to-string map -- safe to assert here
    // rather than re-validate a value this same service already wrote.
    attributes: variant.attributes as Record<string, string>,
    status: variant.status,
    images: variant.images
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toProductImage),
    inventory: variant.inventory ? toInventory(variant.inventory) : null,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
}

export function toProduct(product: ProductWithRelations): Product {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    sku: product.sku,
    // .toFixed(2), not .toString() -- decimal.js's toString() trims
    // trailing zeros (10.00 -> "10"), breaking the documented "always 2
    // decimal places" wire contract for whole-number prices.
    price: product.price.toFixed(2),
    salePrice: product.salePrice?.toFixed(2) ?? null,
    currency: product.currency,
    status: product.status,
    categoryId: product.categoryId,
    category: product.category,
    images: product.images
      .filter((image) => !image.variantId)
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(toProductImage),
    inventory: product.inventory ? toInventory(product.inventory) : null,
    variants: product.variants.map(toProductVariant),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
