import type { PaginationQuery } from "@kiranabar/validation";
import type { Cart as CartType } from "@kiranabar/types";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartService } from "../cart/cart.service";
import type { PrismaService } from "../prisma/prisma.service";
import { OrdersService } from "./orders.service";

const SHIPPING_ADDRESS = {
  recipientName: "Jane Doe",
  line1: "123 Main St",
  line2: undefined,
  city: "Springfield",
  state: "IL",
  postalCode: "62704",
  country: "US",
  phone: undefined,
};

const CART_WITH_ITEM: CartType = {
  id: "cart-1",
  currency: "USD",
  subtotal: "40.00",
  items: [
    {
      productId: "prod-1",
      product: {
        id: "prod-1",
        name: "Classic Tee",
        slug: "classic-tee",
        price: "20.00",
        salePrice: null,
        currency: "USD",
        status: "ACTIVE",
        image: null,
      },
      variantId: null,
      variant: null,
      quantity: 2,
      unitPrice: "20.00",
      lineTotal: "40.00",
    },
  ],
};

const CART_WITH_VARIANT_ITEM: CartType = {
  ...CART_WITH_ITEM,
  items: [
    {
      ...CART_WITH_ITEM.items[0]!,
      variantId: "var-1",
      variant: {
        id: "var-1",
        sku: "TSHIRT-001-RED-M",
        attributes: { color: "Red", size: "M" },
        price: "22.00",
        salePrice: null,
        status: "ACTIVE",
      },
    },
  ],
};

const DB_VARIANT = {
  id: "var-1",
  productId: "prod-1",
  sku: "TSHIRT-001-RED-M",
  status: "ACTIVE",
  price: new Prisma.Decimal("22.00"),
  salePrice: null,
  attributes: { color: "Red", size: "M" },
  inventory: { quantityAvailable: 2, version: 0 },
};

const DB_PRODUCT = {
  id: "prod-1",
  name: "Classic Tee",
  sku: "TSHIRT-001",
  status: "ACTIVE",
  price: new Prisma.Decimal("20.00"),
  salePrice: null,
  inventory: { quantityAvailable: 5, version: 0 },
};

function buildOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    userId: "user-1",
    status: "PLACED",
    subtotal: new Prisma.Decimal("40.00"),
    currency: "USD",
    shippingRecipientName: "Jane Doe",
    shippingLine1: "123 Main St",
    shippingLine2: null,
    shippingCity: "Springfield",
    shippingState: "IL",
    shippingPostalCode: "62704",
    shippingCountry: "US",
    shippingPhone: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    items: [
      {
        productId: "prod-1",
        productName: "Classic Tee",
        productSku: "TSHIRT-001",
        variantId: null,
        variantSku: null,
        variantAttributes: null,
        unitPrice: new Prisma.Decimal("20.00"),
        quantity: 2,
        lineTotal: new Prisma.Decimal("40.00"),
      },
    ],
    ...overrides,
  };
}

function buildPrismaMock() {
  const tx = {
    product: { findUnique: vi.fn() },
    productVariant: { findUnique: vi.fn() },
    inventory: { updateMany: vi.fn() },
    order: { create: vi.fn(), update: vi.fn() },
    cart: { deleteMany: vi.fn() },
  };

  return {
    tx,
    order: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (txArg: typeof tx) => unknown) => cb(tx)),
  };
}

function buildCartServiceMock() {
  return { getCart: vi.fn() };
}

describe("OrdersService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let cartService: ReturnType<typeof buildCartServiceMock>;
  let service: OrdersService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    cartService = buildCartServiceMock();
    service = new OrdersService(
      prisma as unknown as PrismaService,
      cartService as unknown as CartService,
    );
  });

  describe("checkout", () => {
    it("rejects an empty cart", async () => {
      cartService.getCart.mockResolvedValue({
        id: null,
        items: [],
        subtotal: "0.00",
        currency: "USD",
      });

      await expect(
        service.checkout("user-1", { shippingAddress: SHIPPING_ADDRESS }),
      ).rejects.toThrow("Cart is empty");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects when requested quantity exceeds available stock", async () => {
      cartService.getCart.mockResolvedValue(CART_WITH_ITEM);
      prisma.tx.product.findUnique.mockResolvedValue({
        ...DB_PRODUCT,
        inventory: { quantityAvailable: 1, version: 0 },
      });

      await expect(
        service.checkout("user-1", { shippingAddress: SHIPPING_ADDRESS }),
      ).rejects.toThrow(/Not enough stock/);
      expect(prisma.tx.order.create).not.toHaveBeenCalled();
    });

    it("rejects with a conflict when the inventory version is stale", async () => {
      cartService.getCart.mockResolvedValue(CART_WITH_ITEM);
      prisma.tx.product.findUnique.mockResolvedValue(DB_PRODUCT);
      prisma.tx.inventory.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.checkout("user-1", { shippingAddress: SHIPPING_ADDRESS }),
      ).rejects.toThrow(/Stock for "Classic Tee" changed/);
      expect(prisma.tx.order.create).not.toHaveBeenCalled();
    });

    it("creates the order, decrements inventory, and clears the cart on success", async () => {
      cartService.getCart.mockResolvedValue(CART_WITH_ITEM);
      prisma.tx.product.findUnique.mockResolvedValue(DB_PRODUCT);
      prisma.tx.inventory.updateMany.mockResolvedValue({ count: 1 });
      prisma.tx.order.create.mockResolvedValue(buildOrderRow());

      const result = await service.checkout("user-1", { shippingAddress: SHIPPING_ADDRESS });

      expect(prisma.tx.inventory.updateMany).toHaveBeenCalledWith({
        where: { productId: "prod-1", version: 0 },
        data: { quantityAvailable: { decrement: 2 }, version: { increment: 1 } },
      });
      expect(prisma.tx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            status: "PLACED",
            currency: "USD",
            shippingCountry: "US",
          }),
        }),
      );
      expect(prisma.tx.cart.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
      expect(result.status).toBe("PLACED");
      expect(result.subtotal).toBe("40.00");
      expect(result.items[0]?.productName).toBe("Classic Tee");
      expect(result.items[0]?.lineTotal).toBe("40.00");
    });

    it("checks and decrements the variant's own inventory, not the product's, for a variant line", async () => {
      cartService.getCart.mockResolvedValue(CART_WITH_VARIANT_ITEM);
      prisma.tx.product.findUnique.mockResolvedValue(DB_PRODUCT);
      prisma.tx.productVariant.findUnique.mockResolvedValue(DB_VARIANT);
      prisma.tx.inventory.updateMany.mockResolvedValue({ count: 1 });
      prisma.tx.order.create.mockResolvedValue(
        buildOrderRow({
          items: [
            {
              productId: "prod-1",
              productName: "Classic Tee",
              productSku: "TSHIRT-001",
              variantId: "var-1",
              variantSku: "TSHIRT-001-RED-M",
              variantAttributes: { color: "Red", size: "M" },
              unitPrice: new Prisma.Decimal("22.00"),
              quantity: 2,
              lineTotal: new Prisma.Decimal("44.00"),
            },
          ],
        }),
      );

      const result = await service.checkout("user-1", { shippingAddress: SHIPPING_ADDRESS });

      expect(prisma.tx.inventory.updateMany).toHaveBeenCalledWith({
        where: { variantId: "var-1", version: 0 },
        data: { quantityAvailable: { decrement: 2 }, version: { increment: 1 } },
      });
      expect(prisma.tx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: [
                expect.objectContaining({
                  variantId: "var-1",
                  variantSku: "TSHIRT-001-RED-M",
                  variantAttributes: { color: "Red", size: "M" },
                }),
              ],
            },
          }),
        }),
      );
      expect(result.items[0]?.variantSku).toBe("TSHIRT-001-RED-M");
    });

    it("rejects when the variant's own stock, not the product's, is insufficient", async () => {
      cartService.getCart.mockResolvedValue(CART_WITH_VARIANT_ITEM);
      prisma.tx.product.findUnique.mockResolvedValue(DB_PRODUCT); // product itself has 5 available
      prisma.tx.productVariant.findUnique.mockResolvedValue({
        ...DB_VARIANT,
        inventory: { quantityAvailable: 1, version: 0 }, // variant only has 1
      });

      await expect(
        service.checkout("user-1", { shippingAddress: SHIPPING_ADDRESS }),
      ).rejects.toThrow(/Not enough stock/);
      expect(prisma.tx.order.create).not.toHaveBeenCalled();
    });
  });

  describe("findOrders", () => {
    it("scopes a CUSTOMER caller to their own orders and applies pagination", async () => {
      prisma.order.findMany.mockResolvedValue([buildOrderRow()]);
      prisma.order.count.mockResolvedValue(1);
      const pagination: PaginationQuery = { page: 2, pageSize: 5 };

      const result = await service.findOrders("user-1", false, pagination);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" }, skip: 5, take: 5 }),
      );
      expect(prisma.order.count).toHaveBeenCalledWith({ where: { userId: "user-1" } });
      expect(result).toEqual({
        items: [expect.objectContaining({ id: "order-1" })],
        total: 1,
        page: 2,
        pageSize: 5,
      });
    });

    it("ignores a filterUserId for a non-staff caller", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findOrders("user-1", false, { page: 1, pageSize: 20 }, "someone-else");

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } }),
      );
    });

    it("returns every order for a staff caller with no filterUserId", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findOrders("admin-1", true, { page: 1, pageSize: 20 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it("scopes to filterUserId for a staff caller when provided", async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findOrders("admin-1", true, { page: 1, pageSize: 20 }, "customer-1");

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "customer-1" } }),
      );
    });
  });

  describe("findOrder", () => {
    it("404s a non-staff caller for an order belonging to a different user", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow({ userId: "someone-else" }));

      await expect(service.findOrder("user-1", false, "order-1")).rejects.toThrow(
        "Order not found",
      );
    });

    it("404s when no such order exists, staff or not", async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.findOrder("user-1", false, "missing")).rejects.toThrow(
        "Order not found",
      );
      await expect(service.findOrder("admin-1", true, "missing")).rejects.toThrow(
        "Order not found",
      );
    });

    it("returns the order when owned by the caller", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow());

      await expect(service.findOrder("user-1", false, "order-1")).resolves.toEqual(
        expect.objectContaining({ id: "order-1" }),
      );
    });

    it("returns any order for a staff caller regardless of ownership", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow({ userId: "someone-else" }));

      await expect(service.findOrder("admin-1", true, "order-1")).resolves.toEqual(
        expect.objectContaining({ id: "order-1" }),
      );
    });
  });

  describe("cancelMyOrder", () => {
    it("404s when the order belongs to a different user", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow({ userId: "someone-else" }));

      await expect(service.cancelMyOrder("user-1", "order-1")).rejects.toThrow("Order not found");
    });

    it("rejects cancelling an order that is no longer PLACED", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow({ status: "PAID" }));

      await expect(service.cancelMyOrder("user-1", "order-1")).rejects.toThrow(
        /hasn't been paid yet/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("cancels a PLACED order and restores stock", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow());
      prisma.tx.order.update.mockResolvedValue(buildOrderRow({ status: "CANCELLED" }));

      const result = await service.cancelMyOrder("user-1", "order-1");

      expect(prisma.tx.inventory.updateMany).toHaveBeenCalledWith({
        where: { productId: "prod-1" },
        data: { quantityAvailable: { increment: 2 }, version: { increment: 1 } },
      });
      expect(prisma.tx.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "order-1" }, data: { status: "CANCELLED" } }),
      );
      expect(result.status).toBe("CANCELLED");
    });

    it("restocks the variant's own inventory, not the product's, when the order item has a variant", async () => {
      prisma.order.findUnique.mockResolvedValue(
        buildOrderRow({
          items: [
            {
              productId: "prod-1",
              productName: "Classic Tee",
              productSku: "TSHIRT-001",
              variantId: "var-1",
              variantSku: "TSHIRT-001-RED-M",
              variantAttributes: { color: "Red", size: "M" },
              unitPrice: new Prisma.Decimal("22.00"),
              quantity: 2,
              lineTotal: new Prisma.Decimal("44.00"),
            },
          ],
        }),
      );
      prisma.tx.order.update.mockResolvedValue(buildOrderRow({ status: "CANCELLED" }));

      await service.cancelMyOrder("user-1", "order-1");

      expect(prisma.tx.inventory.updateMany).toHaveBeenCalledWith({
        where: { variantId: "var-1" },
        data: { quantityAvailable: { increment: 2 }, version: { increment: 1 } },
      });
    });
  });

  describe("updateStatus", () => {
    it("404s when no such order exists", async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus("missing", "PAID")).rejects.toThrow("Order not found");
    });

    it("moves PLACED to PAID", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow({ status: "PLACED" }));
      prisma.order.update.mockResolvedValue(buildOrderRow({ status: "PAID" }));

      const result = await service.updateStatus("order-1", "PAID");

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "order-1" }, data: { status: "PAID" } }),
      );
      expect(result.status).toBe("PAID");
    });

    it("rejects skipping a stage (PLACED straight to SHIPPED)", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow({ status: "PLACED" }));

      await expect(service.updateStatus("order-1", "SHIPPED")).rejects.toThrow(
        /next status must be "PAID"/,
      );
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it("rejects a backward transition (PAID back to PLACED is not a valid target anyway, but SHIPPED back to PAID is)", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow({ status: "SHIPPED" }));

      await expect(service.updateStatus("order-1", "PAID")).rejects.toThrow(
        /next status must be "DELIVERED"/,
      );
    });

    it("rejects updating a terminal DELIVERED order", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow({ status: "DELIVERED" }));

      await expect(service.updateStatus("order-1", "PAID")).rejects.toThrow(
        /has no further status/,
      );
    });

    it("rejects updating a CANCELLED order", async () => {
      prisma.order.findUnique.mockResolvedValue(buildOrderRow({ status: "CANCELLED" }));

      await expect(service.updateStatus("order-1", "PAID")).rejects.toThrow(
        /has no further status/,
      );
    });
  });
});
