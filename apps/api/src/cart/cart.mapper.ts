import type { Cart as CartType, CartItem as CartItemType } from "@kiranabar/types";
import type { Cart as PrismaCart, CartItem as PrismaCartItem } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { toProduct, toProductVariant } from "../products/product.mapper";

type CartItemWithProduct = PrismaCartItem & {
  product: Parameters<typeof toProduct>[0];
  variant: Parameters<typeof toProductVariant>[0] | null;
};

type CartWithItems = PrismaCart & { items: CartItemWithProduct[] };

export function toCart(cart: CartWithItems): CartType {
  const items: CartItemType[] = cart.items.map((item) => {
    const product = toProduct(item.product);
    const variant = item.variant ? toProductVariant(item.variant) : null;
    const unitPrice = variant?.salePrice ?? variant?.price ?? product.salePrice ?? product.price;
    const lineTotal = new Prisma.Decimal(unitPrice).times(item.quantity).toFixed(2);

    return {
      productId: item.productId,
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        salePrice: product.salePrice,
        currency: product.currency,
        status: product.status,
        image:
          product.images.find((image) => image.isPrimary)?.url ?? product.images[0]?.url ?? null,
      },
      variantId: item.variantId,
      variant: variant
        ? {
            id: variant.id,
            sku: variant.sku,
            attributes: variant.attributes,
            price: variant.price,
            salePrice: variant.salePrice,
            status: variant.status,
          }
        : null,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
    };
  });

  const subtotal = items
    .reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0))
    .toFixed(2);

  return { id: cart.id, items, subtotal, currency: items[0]?.product.currency ?? "USD" };
}

export function emptyCart(): CartType {
  return { id: null, items: [], subtotal: "0.00", currency: "USD" };
}
