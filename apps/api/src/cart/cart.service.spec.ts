import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@kiranabar/types";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { ProductsService } from "../products/products.service";
import { CartService } from "./cart.service";

const PRODUCT: Product = {
  id: "prod-1",
  name: "Classic Tee",
  slug: "classic-tee",
  description: null,
  sku: "TSHIRT-001",
  price: "20.00",
  salePrice: null,
  currency: "USD",
  status: "ACTIVE",
  categoryId: null,
  category: null,
  images: [],
  inventory: { quantityAvailable: 5, quantityReserved: 0, version: 0 },
  variants: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PRODUCT_WITH_VARIANT: Product = {
  ...PRODUCT,
  variants: [
    {
      id: "var-1",
      productId: "prod-1",
      sku: "TSHIRT-001-RED-M",
      price: "22.00",
      salePrice: null,
      currency: "USD",
      attributes: { color: "Red", size: "M" },
      status: "ACTIVE",
      images: [],
      inventory: { quantityAvailable: 2, quantityReserved: 0, version: 0 },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const CART_ROW = {
  id: "cart-1",
  userId: null,
  guestToken: "guest-token-abc",
  items: [] as unknown[],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildPrismaMock() {
  return {
    cart: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    cartItem: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function buildProductsServiceMock() {
  return { findOne: vi.fn() };
}

describe("CartService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let productsService: ReturnType<typeof buildProductsServiceMock>;
  let service: CartService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    productsService = buildProductsServiceMock();
    service = new CartService(
      prisma as unknown as PrismaService,
      productsService as unknown as ProductsService,
    );
  });

  describe("getCart", () => {
    it("returns an empty cart for an owner with neither userId nor guestToken", async () => {
      const result = await service.getCart({});

      expect(result).toEqual({ id: null, items: [], subtotal: "0.00", currency: "USD" });
      expect(prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it("returns an empty cart when no row exists yet for a guest token", async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const result = await service.getCart({ guestToken: "unknown-token" });

      expect(result.id).toBeNull();
      expect(prisma.cart.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { guestToken: "unknown-token" } }),
      );
    });

    it("looks up by userId, not guestToken, when both would somehow be present", async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      await service.getCart({ userId: "user-1", guestToken: "should-be-ignored" });

      expect(prisma.cart.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" } }),
      );
    });
  });

  describe("addItem", () => {
    it("rejects a product that is not ACTIVE/visible", async () => {
      productsService.findOne.mockRejectedValue(new Error("Product not found"));

      await expect(service.addItem({ guestToken: "t1" }, "missing", 1)).rejects.toThrow(
        "Product not found",
      );
    });

    it("creates a cart for a first-time guest and adds the item", async () => {
      productsService.findOne.mockResolvedValue(PRODUCT);
      prisma.cart.findUnique.mockResolvedValueOnce(null); // findExistingCart: none yet
      prisma.cart.create.mockResolvedValue(CART_ROW);
      prisma.cartItem.findFirst.mockResolvedValue(null);
      prisma.cart.findUniqueOrThrow.mockResolvedValue({ ...CART_ROW, items: [] });

      await service.addItem({ guestToken: "t1" }, "prod-1", 2);

      expect(prisma.cart.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { guestToken: "t1" } }),
      );
      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: "cart-1", productId: "prod-1", variantId: null, quantity: 2 },
      });
    });

    it("adds to the existing quantity when the product is already in the cart", async () => {
      productsService.findOne.mockResolvedValue(PRODUCT);
      prisma.cart.findUnique.mockResolvedValue(CART_ROW);
      prisma.cartItem.findFirst.mockResolvedValue({ id: "item-1", quantity: 1 });
      prisma.cart.findUniqueOrThrow.mockResolvedValue({ ...CART_ROW, items: [] });

      await service.addItem({ guestToken: "t1" }, "prod-1", 2);

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: "item-1" },
        data: { quantity: { increment: 2 } },
      });
    });

    it("rejects a quantity beyond available stock", async () => {
      productsService.findOne.mockResolvedValue(PRODUCT); // quantityAvailable: 5
      prisma.cart.findUnique.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue(CART_ROW);
      prisma.cartItem.findFirst.mockResolvedValue(null);

      await expect(service.addItem({ guestToken: "t1" }, "prod-1", 6)).rejects.toThrow(
        /Only 5 unit/,
      );
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it("resolves stock/price from the selected variant, not the product", async () => {
      productsService.findOne.mockResolvedValue(PRODUCT_WITH_VARIANT);
      prisma.cart.findUnique.mockResolvedValue(CART_ROW);
      prisma.cartItem.findFirst.mockResolvedValue(null);
      prisma.cart.findUniqueOrThrow.mockResolvedValue({ ...CART_ROW, items: [] });

      // Variant has only 2 available -- exceeding that (not the product's 5) should reject.
      await expect(service.addItem({ guestToken: "t1" }, "prod-1", 3, "var-1")).rejects.toThrow(
        /Only 2 unit/,
      );

      await service.addItem({ guestToken: "t1" }, "prod-1", 2, "var-1");
      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: "cart-1", productId: "prod-1", variantId: "var-1", quantity: 2 },
      });
    });

    it("rejects an unknown variantId", async () => {
      productsService.findOne.mockResolvedValue(PRODUCT_WITH_VARIANT);
      prisma.cart.findUnique.mockResolvedValue(CART_ROW);

      await expect(
        service.addItem({ guestToken: "t1" }, "prod-1", 1, "missing-variant"),
      ).rejects.toThrow("Variant not found for this product");
    });

    it("folds into the winning row when a P2002 race is lost on create", async () => {
      productsService.findOne.mockResolvedValue(PRODUCT);
      prisma.cart.findUnique.mockResolvedValue(CART_ROW);
      prisma.cartItem.findFirst
        .mockResolvedValueOnce(null) // addItem's own pre-check
        .mockResolvedValueOnce(null); // upsertItemQuantity's internal check (knownExisting bypasses it, but guard anyway)
      prisma.cartItem.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
      prisma.cartItem.findFirstOrThrow.mockResolvedValue({ id: "item-won" });
      prisma.cart.findUniqueOrThrow.mockResolvedValue({ ...CART_ROW, items: [] });

      await service.addItem({ guestToken: "t1" }, "prod-1", 2);

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: "item-won" },
        data: { quantity: { increment: 2 } },
      });
    });
  });

  describe("updateItem / removeItem", () => {
    it("updateItem 404s when the cart has no such item", async () => {
      prisma.cart.findUnique.mockResolvedValue({ ...CART_ROW, items: [] });

      await expect(service.updateItem({ guestToken: "t1" }, "prod-1", 2)).rejects.toThrow(
        "Item not found in cart",
      );
    });

    it("removeItem 404s when there is no cart at all", async () => {
      await expect(service.removeItem({}, "prod-1")).rejects.toThrow("Item not found in cart");
    });

    it("updateItem rejects a quantity beyond available stock", async () => {
      prisma.cart.findUnique.mockResolvedValue({
        ...CART_ROW,
        items: [{ id: "item-1", productId: "prod-1", variantId: null, quantity: 1 }],
      });
      productsService.findOne.mockResolvedValue(PRODUCT); // quantityAvailable: 5

      await expect(service.updateItem({ guestToken: "t1" }, "prod-1", 10)).rejects.toThrow(
        /Only 5 unit/,
      );
    });

    it("updateItem and removeItem only match the line for the given variantId", async () => {
      prisma.cart.findUnique.mockResolvedValue({
        ...CART_ROW,
        items: [
          { id: "item-plain", productId: "prod-1", variantId: null, quantity: 1 },
          { id: "item-variant", productId: "prod-1", variantId: "var-1", quantity: 1 },
        ],
      });
      productsService.findOne.mockResolvedValue(PRODUCT_WITH_VARIANT);
      prisma.cart.findUniqueOrThrow.mockResolvedValue({ ...CART_ROW, items: [] });

      await service.updateItem({ guestToken: "t1" }, "prod-1", 2, "var-1");

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: "item-variant" },
        data: { quantity: 2 },
      });
    });
  });

  describe("clear", () => {
    it("is a no-op when there is no cart", async () => {
      await expect(service.clear({})).resolves.toBeUndefined();
      expect(prisma.cart.delete).not.toHaveBeenCalled();
    });

    it("deletes the cart row when one exists", async () => {
      prisma.cart.findUnique.mockResolvedValue(CART_ROW);

      await service.clear({ guestToken: "t1" });

      expect(prisma.cart.delete).toHaveBeenCalledWith({ where: { id: "cart-1" } });
    });
  });

  describe("mergeGuestCartIntoUser", () => {
    it("does nothing when no guest token is presented", async () => {
      await service.mergeGuestCartIntoUser(undefined, "user-1");

      expect(prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it("does nothing when the guest token matches no cart", async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      await service.mergeGuestCartIntoUser("missing-token", "user-1");

      expect(prisma.cart.upsert).not.toHaveBeenCalled();
    });

    it("removes an empty guest cart without creating a user cart", async () => {
      prisma.cart.findUnique.mockResolvedValue({ ...CART_ROW, items: [] });

      await service.mergeGuestCartIntoUser("t1", "user-1");

      expect(prisma.cart.upsert).not.toHaveBeenCalled();
      expect(prisma.cart.delete).toHaveBeenCalledWith({ where: { id: "cart-1" } });
    });

    it("merges guest items (carrying variantId through) into the user's cart and removes the guest cart", async () => {
      prisma.cart.findUnique.mockResolvedValue({
        ...CART_ROW,
        items: [{ productId: "prod-1", variantId: "var-1", quantity: 2 }],
      });
      prisma.cart.upsert.mockResolvedValue({ id: "user-cart-1" });
      prisma.cartItem.findFirst.mockResolvedValue(null);

      await service.mergeGuestCartIntoUser("t1", "user-1");

      expect(prisma.cart.upsert).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        create: { userId: "user-1" },
        update: {},
      });
      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: "user-cart-1", productId: "prod-1", variantId: "var-1", quantity: 2 },
      });
      expect(prisma.cart.delete).toHaveBeenCalledWith({ where: { id: "cart-1" } });
    });

    it("increments an existing matching line instead of creating a duplicate", async () => {
      prisma.cart.findUnique.mockResolvedValue({
        ...CART_ROW,
        items: [{ productId: "prod-1", variantId: null, quantity: 2 }],
      });
      prisma.cart.upsert.mockResolvedValue({ id: "user-cart-1" });
      prisma.cartItem.findFirst.mockResolvedValue({ id: "existing-item" });

      await service.mergeGuestCartIntoUser("t1", "user-1");

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: "existing-item" },
        data: { quantity: { increment: 2 } },
      });
    });
  });
});
