import type { OrderStatus } from "@kiranabar/types";

/**
 * Mirrors OrdersService's next-status map (apps/api/src/orders/orders.service.ts)
 * so the UI only ever offers a legal transition -- PLACED -> PAID -> SHIPPED
 * -> DELIVERED, one stage at a time. CANCELLED and DELIVERED are terminal.
 * The backend is still the source of truth/enforcement; this only avoids
 * showing a button for a transition that would 409.
 */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  PLACED: "PAID",
  PAID: "SHIPPED",
  SHIPPED: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};
