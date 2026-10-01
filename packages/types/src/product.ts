/** Mirrors Prisma's `ProductStatus` and `CategoryStatus` enums (identical values, kept separate -- see docs/database.md). */
export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type CategoryStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
}

export interface Category extends CategorySummary {
  description: string | null;
  status: CategoryStatus;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A category with its direct children loaded -- one level, not a full recursive tree (see docs/database.md). */
export interface CategoryWithChildren extends Category {
  children: Category[];
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  position: number;
  isPrimary: boolean;
  /** Set for a variant-specific photo; null for the product's general gallery. */
  variantId: string | null;
}

export interface ProductInventory {
  quantityAvailable: number;
  quantityReserved: number;
  /** Required by the inventory adjustment endpoint's optimistic-concurrency check. */
  version: number;
}

/**
 * Optional, additive sub-resource of Product -- a product may have zero or
 * more variants (color, size, etc.), each independently priced and
 * stocked. Product itself keeps its own price/sku/status/inventory
 * unchanged. See docs/database.md's "Product variants".
 */
export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  price: string;
  salePrice: string | null;
  currency: string;
  /** e.g. `{ color: "Red", size: "M" }`. */
  attributes: Record<string, string>;
  status: ProductStatus;
  images: ProductImage[];
  inventory: ProductInventory | null;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sku: string;
  /**
   * Decimal values serialize as strings, never numbers -- avoids any
   * floating-point representation of money anywhere on the wire. Parse
   * with a decimal library on the client if arithmetic is needed.
   */
  price: string;
  salePrice: string | null;
  currency: string;
  status: ProductStatus;
  categoryId: string | null;
  category: CategorySummary | null;
  images: ProductImage[];
  inventory: ProductInventory | null;
  /** Always an array, even for a product with no variants. */
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}
