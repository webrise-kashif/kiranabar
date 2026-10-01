import { z } from "zod";

export const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  /** Pins this line to one specific variant of the product, when set. */
  variantId: z.string().uuid().optional(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(99),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

/**
 * `?variantId=...` on `PATCH/DELETE /cart/items/:productId` -- addresses the
 * specific variant line rather than the no-variant line for that product.
 * Omitted entirely addresses the no-variant line, an unambiguous, distinct
 * line from any variant line for the same product.
 */
export const cartItemVariantQuerySchema = z.object({
  variantId: z.string().uuid().optional(),
});
export type CartItemVariantQuery = z.infer<typeof cartItemVariantQuerySchema>;
