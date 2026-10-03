import type { Order, PaginatedResult } from "@kiranabar/types";
import type { CheckoutInput } from "@kiranabar/validation";

/** Order calls for the signed-in shopper (the API requires an account). */
export function useOrders() {
  const apiClient = useApiClient();

  return {
    /** Turns the shopper's cart into an order; the API empties the cart. */
    placeOrder: (input: CheckoutInput) => apiClient.post<Order>("/orders/checkout", input),
    getOrder: (id: string) => apiClient.get<Order>(`/orders/${encodeURIComponent(id)}`),
    /** The shopper's own orders, newest first (the API scopes this to the caller). */
    listOrders: (page: number, pageSize = 10) =>
      apiClient.get<PaginatedResult<Order>>("/orders", { query: { page, pageSize } }),
    /** Only allowed while the order is still PLACED; the API restores the stock. */
    cancelOrder: (id: string) => apiClient.patch<Order>(`/orders/${encodeURIComponent(id)}/cancel`),
  };
}
