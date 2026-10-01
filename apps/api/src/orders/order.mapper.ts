import type { Order as OrderType, OrderItem as OrderItemType } from "@kiranabar/types";
import type { Order as PrismaOrder, OrderItem as PrismaOrderItem } from "@prisma/client";

export const ORDER_INCLUDE = { items: true } as const;

type OrderWithItems = PrismaOrder & { items: PrismaOrderItem[] };

function toOrderItem(item: PrismaOrderItem): OrderItemType {
  return {
    productId: item.productId,
    productName: item.productName,
    productSku: item.productSku,
    variantId: item.variantId,
    variantSku: item.variantSku,
    // Written only via productVariantAttributesSchema at checkout time --
    // see the equivalent comment on toProductVariant in product.mapper.ts.
    variantAttributes: item.variantAttributes as Record<string, string> | null,
    unitPrice: item.unitPrice.toFixed(2),
    quantity: item.quantity,
    lineTotal: item.lineTotal.toFixed(2),
  };
}

export function toOrder(order: OrderWithItems): OrderType {
  return {
    id: order.id,
    status: order.status,
    items: order.items.map(toOrderItem),
    subtotal: order.subtotal.toFixed(2),
    currency: order.currency,
    shippingAddress: {
      recipientName: order.shippingRecipientName,
      line1: order.shippingLine1,
      line2: order.shippingLine2,
      city: order.shippingCity,
      state: order.shippingState,
      postalCode: order.shippingPostalCode,
      country: order.shippingCountry,
      phone: order.shippingPhone,
    },
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
