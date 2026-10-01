import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "./inventory.service";

const DB_INVENTORY = {
  id: "inv-1",
  productId: "prod-1",
  quantityAvailable: 10,
  quantityReserved: 2,
  version: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildPrismaMock() {
  return {
    inventory: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe("InventoryService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: InventoryService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new InventoryService(prisma as unknown as PrismaService);
  });

  describe("findByProductId", () => {
    it("throws 404 when no inventory row exists for the product", async () => {
      prisma.inventory.findUnique.mockResolvedValue(null);

      await expect(service.findByProductId("missing")).rejects.toThrow(
        "Inventory not found for this product",
      );
    });

    it("returns the inventory shape, including version", async () => {
      prisma.inventory.findUnique.mockResolvedValue(DB_INVENTORY);

      await expect(service.findByProductId("prod-1")).resolves.toEqual({
        quantityAvailable: 10,
        quantityReserved: 2,
        version: 3,
      });
    });
  });

  describe("adjust", () => {
    it("throws 404 when the product has no inventory row", async () => {
      prisma.inventory.findUnique.mockResolvedValue(null);

      await expect(service.adjust("missing", { quantityAvailable: 5, version: 0 })).rejects.toThrow(
        "Inventory not found for this product",
      );
    });

    it("rejects with 409 when the presented version is stale", async () => {
      prisma.inventory.findUnique.mockResolvedValueOnce({ id: "inv-1" });
      prisma.inventory.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.adjust("prod-1", { quantityAvailable: 5, version: 1 })).rejects.toThrow(
        /updated by another request/,
      );

      expect(prisma.inventory.updateMany).toHaveBeenCalledWith({
        where: { productId: "prod-1", version: 1 },
        data: { quantityAvailable: 5, version: { increment: 1 } },
      });
    });

    it("succeeds and increments version when the presented version matches", async () => {
      prisma.inventory.findUnique
        .mockResolvedValueOnce({ id: "inv-1" })
        .mockResolvedValueOnce({ ...DB_INVENTORY, quantityAvailable: 8, version: 4 });
      prisma.inventory.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.adjust("prod-1", { quantityAvailable: 8, version: 3 });

      expect(result.version).toBe(4);
      expect(result.quantityAvailable).toBe(8);
    });
  });

  describe("findByVariantId", () => {
    it("throws 404 when no inventory row exists for the variant", async () => {
      prisma.inventory.findUnique.mockResolvedValue(null);

      await expect(service.findByVariantId("missing")).rejects.toThrow(
        "Inventory not found for this variant",
      );
    });

    it("returns the inventory shape keyed by variantId", async () => {
      prisma.inventory.findUnique.mockResolvedValue({
        ...DB_INVENTORY,
        productId: null,
        variantId: "var-1",
      });

      await expect(service.findByVariantId("var-1")).resolves.toEqual({
        quantityAvailable: 10,
        quantityReserved: 2,
        version: 3,
      });
      expect(prisma.inventory.findUnique).toHaveBeenCalledWith({ where: { variantId: "var-1" } });
    });
  });

  describe("adjustVariant", () => {
    it("rejects with 409 when the presented version is stale", async () => {
      prisma.inventory.findUnique.mockResolvedValueOnce({ id: "inv-1" });
      prisma.inventory.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.adjustVariant("var-1", { quantityAvailable: 5, version: 1 }),
      ).rejects.toThrow(/updated by another request/);

      expect(prisma.inventory.updateMany).toHaveBeenCalledWith({
        where: { variantId: "var-1", version: 1 },
        data: { quantityAvailable: 5, version: { increment: 1 } },
      });
    });

    it("succeeds and increments version when the presented version matches", async () => {
      prisma.inventory.findUnique.mockResolvedValueOnce({ id: "inv-1" }).mockResolvedValueOnce({
        ...DB_INVENTORY,
        productId: null,
        variantId: "var-1",
        quantityAvailable: 8,
        version: 4,
      });
      prisma.inventory.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.adjustVariant("var-1", { quantityAvailable: 8, version: 3 });

      expect(result.version).toBe(4);
      expect(result.quantityAvailable).toBe(8);
    });
  });
});
