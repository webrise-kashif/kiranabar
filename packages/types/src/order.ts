export type OrderStatus = "PLACED" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export interface ShippingAddress {
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, e.g. "US". */
  country: string;
  phone: string | null;
}

/** A snapshot of a purchased product (and, if selected, variant) -- independent of the live Product/ProductVariant rows. */
export interface OrderItem {
  productId: string;
  productName: string;
  productSku: string;
  /** Set when this line was for a specific variant. */
  variantId: string | null;
  variantSku: string | null;
  variantAttributes: Record<string, string> | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface Order {
  id: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: string;
  currency: string;
  shippingAddress: ShippingAddress;
  createdAt: string;
  updatedAt: string;
}
