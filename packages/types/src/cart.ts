import type { ProductStatus } from "./product";

/** The subset of Product needed to render a cart line item. */
export interface CartItemProduct {
  id: string;
  name: string;
  slug: string;
  price: string;
  salePrice: string | null;
  currency: string;
  status: ProductStatus;
  image: string | null;
}

/** The subset of ProductVariant needed to render a cart line item, when one is selected. */
export interface CartItemVariant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  price: string;
  salePrice: string | null;
  status: ProductStatus;
}

export interface CartItem {
  productId: string;
  product: CartItemProduct;
  /** Set when this line pins a specific variant of the product. */
  variantId: string | null;
  variant: CartItemVariant | null;
  quantity: number;
  /** `variant?.salePrice ?? variant?.price ?? product.salePrice ?? product.price` at read time -- a cart always reflects the current price, never a snapshot. */
  unitPrice: string;
  lineTotal: string;
}

export interface Cart {
  /** null when no cart row exists yet -- an empty guest cart that's never had an item added. */
  id: string | null;
  items: CartItem[];
  subtotal: string;
  currency: string;
}
