import type { Order } from "@kiranabar/types";
import type { CheckoutInput } from "@kiranabar/validation";

/** Order calls for the signed-in shopper (the API requires an account). */
export function useOrders() {
  const apiClient = useApiClient();

  return {
    /** Turns the shopper's cart into an order; the API empties the cart. */
    placeOrder: (input: CheckoutInput) => apiClient.post<Order>("/orders/checkout", input),
    getOrder: (id: string) => apiClient.get<Order>(`/orders/${encodeURIComponent(id)}`),
  };
}
