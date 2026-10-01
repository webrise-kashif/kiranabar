import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Order, OrderStatus, PaginatedResult } from "@kiranabar/types";
import type { CheckoutInput, PaginationQuery } from "@kiranabar/validation";
import { Prisma } from "@prisma/client";
import { CartService } from "../cart/cart.service";
import { PrismaService } from "../prisma/prisma.service";
import { ORDER_INCLUDE, toOrder } from "./order.mapper";

/**
 * Order flow for both customers and staff. Checkout and cancellation stay
 * customer-only (see `checkout`/`cancelMyOrder`); `findOrders`/`findOrder`
 * are role-aware the same way `ProductsService.findMany`/`findOne` are
 * (an ADMIN/SUPER_ADMIN caller sees every order, a CUSTOMER only their
 * own); `updateStatus` is admin-only, enforced by `@Roles(...)` on the
 * controller, not here.
 *
 * `checkout` is the one place in this codebase that reaches into another
 * domain's Prisma tables (Product, Inventory) directly rather than going
 * through ProductsService/InventoryService, because it needs all of
 * order-creation + stock-decrement + cart-clearing to happen in a single
 * database transaction -- and the per-service `this.prisma` pattern used
 * everywhere else has no way to share one transaction handle across
 * services. This is a deliberate, narrow exception; see docs/orders.md.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
  ) {}

  async checkout(userId: string, input: CheckoutInput): Promise<Order> {
    const cart = await this.cartService.getCart({ userId });

    if (cart.items.length === 0) {
      throw new BadRequestException("Cart is empty");
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const orderItemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

      for (const cartItem of cart.items) {
        const product = await tx.product.findUnique({
          where: { id: cartItem.productId },
          include: { inventory: true },
        });

        if (!product || product.status !== "ACTIVE") {
          throw new BadRequestException(`"${cartItem.product.name}" is no longer available`);
        }

        // A cart line pinned to a variant checks/decrements that variant's
        // own inventory instead of the product's -- see cart.service.ts's
        // assertWithinStock for the equivalent add-to-cart-time rule.
        const variant = cartItem.variantId
          ? await tx.productVariant.findUnique({
              where: { id: cartItem.variantId },
              include: { inventory: true },
            })
          : null;

        if (cartItem.variantId && (!variant || variant.status !== "ACTIVE")) {
          throw new BadRequestException(`"${cartItem.product.name}" is no longer available`);
        }

        const inventory = variant?.inventory ?? product.inventory;

        if (!inventory || inventory.quantityAvailable < cartItem.quantity) {
          throw new BadRequestException(`Not enough stock for "${product.name}"`);
        }

        // Same optimistic-concurrency guard InventoryService.adjust() uses
        // (docs/database.md) -- a concurrent checkout for the same
        // product/variant fails this update rather than both succeeding
        // and overselling.
        const decremented = await tx.inventory.updateMany({
          where: variant
            ? { variantId: variant.id, version: inventory.version }
            : { productId: product.id, version: inventory.version },
          data: {
            quantityAvailable: { decrement: cartItem.quantity },
            version: { increment: 1 },
          },
        });

        if (decremented.count === 0) {
          throw new ConflictException(`Stock for "${product.name}" changed -- please try again`);
        }

        const unitPrice = variant
          ? (variant.salePrice ?? variant.price)
          : (product.salePrice ?? product.price);

        orderItemsData.push({
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          variantId: variant?.id,
          variantSku: variant?.sku,
          // Written only via productVariantAttributesSchema, so never
          // actually JSON null despite Prisma's JsonValue type allowing it.
          variantAttributes: variant?.attributes as Prisma.InputJsonValue | undefined,
          unitPrice,
          quantity: cartItem.quantity,
          lineTotal: unitPrice.times(cartItem.quantity),
        });
      }

      const subtotal = orderItemsData.reduce(
        (sum, item) => sum.plus(item.lineTotal as Prisma.Decimal),
        new Prisma.Decimal(0),
      );

      const createdOrder = await tx.order.create({
        data: {
          userId,
          status: "PLACED",
          subtotal,
          currency: cart.currency,
          shippingRecipientName: input.shippingAddress.recipientName,
          shippingLine1: input.shippingAddress.line1,
          shippingLine2: input.shippingAddress.line2,
          shippingCity: input.shippingAddress.city,
          shippingState: input.shippingAddress.state,
          shippingPostalCode: input.shippingAddress.postalCode,
          shippingCountry: input.shippingAddress.country,
          shippingPhone: input.shippingAddress.phone,
          items: { create: orderItemsData },
        },
        include: ORDER_INCLUDE,
      });

      // The cart is now consumed into the order -- clear it directly
      // within the same transaction rather than via CartService.clear(),
      // for the same atomicity reason noted above.
      await tx.cart.deleteMany({ where: { userId } });

      return createdOrder;
    });

    return toOrder(order);
  }

  /**
   * A CUSTOMER caller is always forced to their own orders regardless of
   * `filterUserId` -- the same "query param isn't trusted for
   * authorization" rule `ProductsService.findMany`'s `status` filter
   * follows. Only an ADMIN/SUPER_ADMIN caller may see every order or scope
   * to a specific customer via `filterUserId`.
   */
  async findOrders(
    callerId: string,
    callerIsStaff: boolean,
    pagination: PaginationQuery,
    filterUserId?: string,
  ): Promise<PaginatedResult<Order>> {
    const { page, pageSize } = pagination;
    const where: Prisma.OrderWhereInput = callerIsStaff
      ? filterUserId
        ? { userId: filterUserId }
        : {}
      : { userId: callerId };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items: items.map(toOrder), total, page, pageSize };
  }

  /** An ADMIN/SUPER_ADMIN caller may look up any order; a CUSTOMER only their own. */
  async findOrder(callerId: string, callerIsStaff: boolean, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (!order || (!callerIsStaff && order.userId !== callerId)) {
      throw new NotFoundException("Order not found");
    }

    return toOrder(order);
  }

  /** Customer self-service, only while still PLACED (before payment). Restores stock. */
  async cancelMyOrder(userId: string, orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException("Order not found");
    }

    if (order.status !== "PLACED") {
      throw new NotCancellableException();
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      // The status check above is only a fast path -- the real guard is
      // this conditional update. It runs first so it takes the order row's
      // lock: of two concurrent cancels, the second waits, then matches no
      // row (status is no longer PLACED) and throws P2025 before restoring
      // any stock, so stock is restored exactly once.
      const updated = await tx.order
        .update({
          where: { id: orderId, status: "PLACED" },
          data: { status: "CANCELLED" },
          include: ORDER_INCLUDE,
        })
        .catch((error: unknown) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
            throw new NotCancellableException();
          }
          throw error;
        });

      // No version guard needed here -- unlike a decrement, restoring
      // stock is commutative: it's always safe to apply regardless of
      // what else has happened to the row in the meantime.
      for (const item of order.items) {
        await tx.inventory.updateMany({
          where: item.variantId ? { variantId: item.variantId } : { productId: item.productId },
          data: { quantityAvailable: { increment: item.quantity }, version: { increment: 1 } },
        });
      }

      return updated;
    });

    return toOrder(cancelled);
  }

  /**
   * Admin-only (enforced by `@Roles(...)` on the controller): moves an
   * order to the next stage of `PLACED -> PAID -> SHIPPED -> DELIVERED`,
   * one stage at a time -- stage-skipping and backward transitions are
   * both rejected, and so is updating a `CANCELLED` (or already
   * `DELIVERED`) order, which has no next stage. Cancellation is not
   * reachable through this method; see `cancelMyOrder`.
   */
  async updateStatus(orderId: string, targetStatus: OrderStatus): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const expectedNext = NEXT_STATUS[order.status];
    if (expectedNext !== targetStatus) {
      throw new ConflictException(
        expectedNext
          ? `Cannot move order from "${order.status}" to "${targetStatus}" -- the next status must be "${expectedNext}"`
          : `Order is "${order.status}", which has no further status to move to`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: targetStatus },
      include: ORDER_INCLUDE,
    });

    return toOrder(updated);
  }
}

class NotCancellableException extends ForbiddenException {
  constructor() {
    super("Only an order that hasn't been paid yet can be cancelled");
  }
}

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  PLACED: "PAID",
  PAID: "SHIPPED",
  SHIPPED: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};
