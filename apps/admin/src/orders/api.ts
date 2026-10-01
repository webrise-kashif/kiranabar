import type { Order, OrderStatus } from "@kiranabar/types";
import { apiClient } from "../lib/api-client";

export function fetchOrder(id: string): Promise<Order> {
  return apiClient.get<Order>(`/orders/${id}`);
}

/** Admin-only. Forward-only, one stage at a time -- see NEXT_STATUS in ./status. */
export function updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  return apiClient.patch<Order>(`/orders/${id}/status`, { status });
}
