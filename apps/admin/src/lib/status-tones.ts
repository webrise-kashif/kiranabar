import type { CategoryStatus, OrderStatus, ProductStatus } from "@kiranabar/types";
import type { BadgeTone } from "../components/Badge";

export function catalogStatusTone(status: ProductStatus | CategoryStatus): BadgeTone {
  if (status === "ACTIVE") return "green";
  if (status === "ARCHIVED") return "red";
  return "gray"; // DRAFT
}

export function orderStatusTone(status: OrderStatus): BadgeTone {
  switch (status) {
    case "PLACED":
      return "blue";
    case "PAID":
      return "indigo";
    case "SHIPPED":
      return "purple";
    case "DELIVERED":
      return "green";
    case "CANCELLED":
      return "red";
  }
}
