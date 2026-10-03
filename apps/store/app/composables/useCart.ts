import type { Cart } from "@kiranabar/types";

export type AddToCartInput = {
  productId: string;
  /** Pins the line to one variant; omit for a product without variants. */
  variantId?: string;
  quantity: number;
};

/**
 * Cart calls for the storefront. Works signed in or as a guest: the API
 * identifies a guest's cart by an httpOnly cookie it sets on the first add,
 * which the browser sends back automatically (`useCredentials: true`).
 */
export function useCart() {
  const apiClient = useApiClient();

  return {
    getCart: () => apiClient.get<Cart>("/cart"),
    addItem: (input: AddToCartInput) => apiClient.post<Cart>("/cart/items", input),
    // A line is addressed by product, plus `variantId` for a variant line --
    // omitting it addresses the product's plain (no-variant) line.
    updateItem: (productId: string, quantity: number, variantId?: string | null) =>
      apiClient.patch<Cart>(
        `/cart/items/${encodeURIComponent(productId)}`,
        { quantity },
        { query: { variantId: variantId ?? undefined } },
      ),
    removeItem: (productId: string, variantId?: string | null) =>
      apiClient.delete<Cart>(`/cart/items/${encodeURIComponent(productId)}`, {
        query: { variantId: variantId ?? undefined },
      }),
  };
}
