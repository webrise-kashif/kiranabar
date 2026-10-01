import { z } from "zod";
import { paginationQuerySchema } from "./pagination";

/**
 * Simple, internationalizable-ready fields -- no per-country format
 * validation (postal code patterns, etc.) yet. See docs/orders.md.
 */
export const shippingAddressSchema = z.object({
  recipientName: z.string().trim().min(1, "Recipient name is required").max(200),
  line1: z.string().trim().min(1, "Address line 1 is required").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1, "City is required").max(100),
  state: z.string().trim().min(1, "State/region is required").max(100),
  postalCode: z.string().trim().min(1, "Postal code is required").max(20),
  country: z
    .string()
    .trim()
    .length(2, 'Country must be a 2-letter ISO code (e.g. "US")')
    .toUpperCase(),
  phone: z.string().trim().max(30).optional(),
});
export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

export const checkoutSchema = z.object({
  shippingAddress: shippingAddressSchema,
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/**
 * `userId`, when present, is only honored for an ADMIN/SUPER_ADMIN caller
 * (view one customer's order history) -- a CUSTOMER's own id is always
 * forced server-side, the same "query param isn't trusted for
 * authorization" pattern as `productQuerySchema`'s `status`.
 */
export const orderQuerySchema = paginationQuerySchema.extend({
  userId: z.string().uuid().optional(),
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;

/**
 * Admin-only, forward-only, one stage at a time -- `PLACED` and `CANCELLED`
 * are deliberately not targetable here: `PLACED` is the automatic starting
 * state, and cancellation stays the customer's own
 * `PATCH /orders/:id/cancel` action, not an admin status update.
 */
export const updateOrderStatusSchema = z.object({
  status: z.enum(["PAID", "SHIPPED", "DELIVERED"]),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
