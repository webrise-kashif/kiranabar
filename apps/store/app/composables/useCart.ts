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
    addItem: (input: AddToCartInput) => apiClient.post<Cart>("/cart/items", input),
  };
}
