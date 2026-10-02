import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoriesService } from "../categories/categories.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ProductsService } from "./products.service";

const DB_PRODUCT = {
  id: "prod-1",
  name: "Classic Tee",
  slug: "classic-tee",
  description: null,
  sku: "TSHIRT-001",
  price: new Prisma.Decimal("24.99"),
  salePrice: null,
  currency: "USD",
  status: "ACTIVE" as const,
  categoryId: null,
  category: null,
  images: [],
  inventory: {
    id: "inv-1",
    productId: "prod-1",
    quantityAvailable: 10,
    quantityReserved: 0,
    version: 0,
  },
  variants: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const DB_VARIANT = {
  id: "var-1",
  productId: "prod-1",
  sku: "TSHIRT-001-RED-M",
  price: new Prisma.Decimal("26.99"),
  salePrice: null,
  currency: "USD",
  attributes: { color: "Red", size: "M" },
  status: "ACTIVE" as const,
  images: [],
  inventory: {
    id: "inv-2",
    variantId: "var-1",
    quantityAvailable: 3,
    quantityReserved: 0,
    version: 0,
  },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function buildPrismaMock() {
  return {
    product: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    productImage: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    productVariant: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

function buildCategoriesServiceMock() {
  return { exists: vi.fn() };
}

describe("ProductsService", () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let categoriesService: ReturnType<typeof buildCategoriesServiceMock>;
  let service: ProductsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    categoriesService = buildCategoriesServiceMock();
    service = new ProductsService(
      prisma as unknown as PrismaService,
      categoriesService as unknown as CategoriesService,
    );
  });

  describe("create", () => {
    it("creates a product with an initial inventory row", async () => {
      prisma.product.create.mockResolvedValue(DB_PRODUCT);

      await service.create({
        name: "Classic Tee",
        slug: "classic-tee",
        sku: "TSHIRT-001",
        price: "24.99",
        currency: "USD",
        status: "DRAFT",
        initialQuantity: 10,
      });

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inventory: { create: { quantityAvailable: 10 } },
          }),
        }),
      );
    });

    it("validates categoryId against CategoriesService, not Prisma directly", async () => {
      categoriesService.exists.mockResolvedValue(false);

      await expect(
        service.create({
          name: "Classic Tee",
          slug: "classic-tee",
          sku: "TSHIRT-001",
          price: "24.99",
          currency: "USD",
          status: "DRAFT",
          initialQuantity: 0,
          categoryId: "missing-category",
        }),
      ).rejects.toThrow("Category not found");

      expect(categoriesService.exists).toHaveBeenCalledWith("missing-category");
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it("defaults the first image to primary when none is marked", async () => {
      prisma.product.create.mockResolvedValue(DB_PRODUCT);

      await service.create({
        name: "Classic Tee",
        slug: "classic-tee",
        sku: "TSHIRT-001",
        price: "24.99",
        currency: "USD",
        status: "DRAFT",
        initialQuantity: 0,
        images: [
          { url: "https://cdn.example.com/a.jpg" },
          { url: "https://cdn.example.com/b.jpg" },
        ],
      });

      const call = prisma.product.create.mock.calls[0]?.[0] as {
        data: { images: { create: Array<{ isPrimary: boolean }> } };
      };
      expect(call.data.images.create[0]?.isPrimary).toBe(true);
      expect(call.data.images.create[1]?.isPrimary).toBe(false);
    });

    it("keeps only the first caller-marked primary image", async () => {
      prisma.product.create.mockResolvedValue(DB_PRODUCT);

      await service.create({
        name: "Classic Tee",
        slug: "classic-tee",
        sku: "TSHIRT-001",
        price: "24.99",
        currency: "USD",
        status: "DRAFT",
        initialQuantity: 0,
        images: [
          { url: "https://cdn.example.com/a.jpg", isPrimary: true },
          { url: "https://cdn.example.com/b.jpg", isPrimary: true },
        ],
      });

      const call = prisma.product.create.mock.calls[0]?.[0] as {
        data: { images: { create: Array<{ isPrimary: boolean }> } };
      };
      expect(call.data.images.create[0]?.isPrimary).toBe(true);
      expect(call.data.images.create[1]?.isPrimary).toBe(false);
    });

    it("maps a unique constraint violation (duplicate slug/sku) to a 409", async () => {
      prisma.product.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["sku"] },
        }),
      );

      await expect(
        service.create({
          name: "Classic Tee",
          slug: "classic-tee",
          sku: "TSHIRT-001",
          price: "24.99",
          currency: "USD",
          status: "DRAFT",
          initialQuantity: 0,
        }),
      ).rejects.toThrow("already exists");
    });
  });

  describe("findMany", () => {
    it("forces ACTIVE-only for non-staff regardless of a requested status", async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findMany({ page: 1, pageSize: 20, status: "DRAFT" }, false);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: "ACTIVE" }) }),
      );
    });

    it("allows staff to see every status by default", async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findMany({ page: 1, pageSize: 20 }, true);

      const call = prisma.product.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
      expect(call.where).not.toHaveProperty("status");
    });
  });

  describe("findOne", () => {
    it("returns 404 for a DRAFT product when the caller is not staff", async () => {
      prisma.product.findFirst.mockResolvedValue({ ...DB_PRODUCT, status: "DRAFT" });

      await expect(service.findOne("classic-tee", false)).rejects.toThrow("Product not found");
    });

    it("returns a DRAFT product for staff", async () => {
      prisma.product.findFirst.mockResolvedValue({ ...DB_PRODUCT, status: "DRAFT" });

      await expect(service.findOne("classic-tee", true)).resolves.toMatchObject({
        status: "DRAFT",
      });
    });
  });

  describe("update", () => {
    it("throws 404 for a missing product", async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.update("missing", { name: "New name" })).rejects.toThrow(
        "Product not found",
      );
    });

    it("rejects a salePrice update that is not less than the stored price", async () => {
      prisma.product.findUnique.mockResolvedValue(DB_PRODUCT);

      await expect(service.update("prod-1", { salePrice: "24.99" })).rejects.toThrow(
        "salePrice must be less than price",
      );
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it("allows a salePrice update below the stored price", async () => {
      prisma.product.findUnique.mockResolvedValue(DB_PRODUCT);
      prisma.product.update.mockResolvedValue({
        ...DB_PRODUCT,
        salePrice: new Prisma.Decimal("19.99"),
      });

      const result = await service.update("prod-1", { salePrice: "19.99" });

      expect(result.salePrice).toBe("19.99");
    });

    it("clears salePrice with null, validating the new price against no sale price at all", async () => {
      // Stored sale price 19.99; the new price 15.00 is only valid because
      // the same update removes the sale price -- null must not fall back
      // to the stored value the way an omitted field does.
      prisma.product.findUnique.mockResolvedValue({
        ...DB_PRODUCT,
        salePrice: new Prisma.Decimal("19.99"),
      });
      prisma.product.update.mockResolvedValue({
        ...DB_PRODUCT,
        price: new Prisma.Decimal("15.00"),
        salePrice: null,
      });

      const result = await service.update("prod-1", { price: "15.00", salePrice: null });

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { price: "15.00", salePrice: null } }),
      );
      expect(result.salePrice).toBeNull();
    });
  });

  describe("archive", () => {
    it("sets status to ARCHIVED rather than deleting the row", async () => {
      prisma.product.findUnique.mockResolvedValue({ id: "prod-1" });
      prisma.product.update.mockResolvedValue({ ...DB_PRODUCT, status: "ARCHIVED" });

      const result = await service.archive("prod-1");

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "prod-1" }, data: { status: "ARCHIVED" } }),
      );
      expect(result.status).toBe("ARCHIVED");
    });
  });

  describe("remove", () => {
    it("throws 404 for a missing product", async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.remove("missing")).rejects.toThrow("Product not found");
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it("rejects deleting a product that isn't archived", async () => {
      prisma.product.findUnique.mockResolvedValue({ status: "ACTIVE" });

      await expect(service.remove("prod-1")).rejects.toThrow(
        "Product must be archived before it can be deleted",
      );
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it("deletes an archived product", async () => {
      prisma.product.findUnique.mockResolvedValue({ status: "ARCHIVED" });
      prisma.product.delete.mockResolvedValue(DB_PRODUCT);

      await service.remove("prod-1");

      expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: "prod-1" } });
    });

    it("maps a restrict violation (existing order history) to a 409", async () => {
      prisma.product.findUnique.mockResolvedValue({ status: "ARCHIVED" });
      prisma.product.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("restricted", {
          code: "P2003",
          clientVersion: "test",
        }),
      );

      await expect(service.remove("prod-1")).rejects.toThrow("order history");
    });
  });

  describe("variants", () => {
    describe("createVariant", () => {
      it("throws 404 for a missing product", async () => {
        prisma.product.findUnique.mockResolvedValue(null);

        await expect(
          service.createVariant("missing", {
            sku: "SKU-2",
            price: "10.00",
            currency: "USD",
            attributes: { color: "Red" },
            status: "ACTIVE",
            initialQuantity: 5,
          }),
        ).rejects.toThrow("Product not found");
        expect(prisma.productVariant.create).not.toHaveBeenCalled();
      });

      it("creates a variant with an inline inventory row", async () => {
        prisma.product.findUnique.mockResolvedValue({ id: "prod-1" });
        prisma.productVariant.create.mockResolvedValue(DB_VARIANT);

        await service.createVariant("prod-1", {
          sku: "TSHIRT-001-RED-M",
          price: "26.99",
          currency: "USD",
          attributes: { color: "Red", size: "M" },
          status: "ACTIVE",
          initialQuantity: 3,
        });

        expect(prisma.productVariant.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              productId: "prod-1",
              sku: "TSHIRT-001-RED-M",
              inventory: { create: { quantityAvailable: 3 } },
            }),
          }),
        );
      });

      it("maps a duplicate SKU to a 409", async () => {
        prisma.product.findUnique.mockResolvedValue({ id: "prod-1" });
        prisma.productVariant.create.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          }),
        );

        await expect(
          service.createVariant("prod-1", {
            sku: "TSHIRT-001-RED-M",
            price: "26.99",
            currency: "USD",
            attributes: { color: "Red" },
            status: "ACTIVE",
            initialQuantity: 0,
          }),
        ).rejects.toThrow("already exists");
      });
    });

    describe("updateVariant", () => {
      it("throws 404 when the variant doesn't belong to the given product", async () => {
        prisma.productVariant.findUnique.mockResolvedValue({ productId: "other-product" });

        await expect(service.updateVariant("prod-1", "var-1", { price: "20.00" })).rejects.toThrow(
          "Variant not found for this product",
        );
      });

      it("rejects a salePrice update that is not less than the stored price", async () => {
        prisma.productVariant.findUnique.mockResolvedValue({
          productId: "prod-1",
          price: new Prisma.Decimal("26.99"),
          salePrice: null,
          status: "ACTIVE",
        });

        await expect(
          service.updateVariant("prod-1", "var-1", { salePrice: "26.99" }),
        ).rejects.toThrow("salePrice must be less than price");
        expect(prisma.productVariant.update).not.toHaveBeenCalled();
      });

      it("clears salePrice with null, validating the new price against no sale price at all", async () => {
        prisma.productVariant.findUnique.mockResolvedValue({
          productId: "prod-1",
          price: new Prisma.Decimal("26.99"),
          salePrice: new Prisma.Decimal("25.00"),
          status: "ACTIVE",
        });
        prisma.productVariant.update.mockResolvedValue({
          ...DB_VARIANT,
          price: new Prisma.Decimal("20.00"),
          salePrice: null,
        });

        await service.updateVariant("prod-1", "var-1", { price: "20.00", salePrice: null });

        expect(prisma.productVariant.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { price: "20.00", salePrice: null } }),
        );
      });
    });

    describe("archiveVariant", () => {
      it("sets status to ARCHIVED rather than deleting the row", async () => {
        prisma.productVariant.findUnique.mockResolvedValue({
          productId: "prod-1",
          price: new Prisma.Decimal("26.99"),
          salePrice: null,
          status: "ACTIVE",
        });
        prisma.productVariant.update.mockResolvedValue({ ...DB_VARIANT, status: "ARCHIVED" });

        const result = await service.archiveVariant("prod-1", "var-1");

        expect(prisma.productVariant.update).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: "var-1" }, data: { status: "ARCHIVED" } }),
        );
        expect(result.status).toBe("ARCHIVED");
      });
    });

    describe("removeVariant", () => {
      it("rejects deleting a variant that isn't archived", async () => {
        prisma.productVariant.findUnique.mockResolvedValue({
          productId: "prod-1",
          price: new Prisma.Decimal("26.99"),
          salePrice: null,
          status: "ACTIVE",
        });

        await expect(service.removeVariant("prod-1", "var-1")).rejects.toThrow(
          "Variant must be archived before it can be deleted",
        );
        expect(prisma.productVariant.delete).not.toHaveBeenCalled();
      });

      it("deletes an archived variant", async () => {
        prisma.productVariant.findUnique.mockResolvedValue({
          productId: "prod-1",
          price: new Prisma.Decimal("26.99"),
          salePrice: null,
          status: "ARCHIVED",
        });
        prisma.productVariant.delete.mockResolvedValue(DB_VARIANT);

        await service.removeVariant("prod-1", "var-1");

        expect(prisma.productVariant.delete).toHaveBeenCalledWith({ where: { id: "var-1" } });
      });

      it("maps a restrict violation (existing order history) to a 409", async () => {
        prisma.productVariant.findUnique.mockResolvedValue({
          productId: "prod-1",
          price: new Prisma.Decimal("26.99"),
          salePrice: null,
          status: "ARCHIVED",
        });
        prisma.productVariant.delete.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("restricted", {
            code: "P2003",
            clientVersion: "test",
          }),
        );

        await expect(service.removeVariant("prod-1", "var-1")).rejects.toThrow("order history");
      });
    });
  });

  describe("images", () => {
    it("addImage demotes any existing primary image when the new one is primary", async () => {
      prisma.product.findUnique.mockResolvedValue({ id: "prod-1" });
      prisma.productImage.findFirst.mockResolvedValue(null);
      prisma.productImage.create.mockResolvedValue({
        id: "img-2",
        productId: "prod-1",
        url: "https://cdn.example.com/b.jpg",
        altText: null,
        position: 0,
        isPrimary: true,
      });

      await service.addImage("prod-1", { url: "https://cdn.example.com/b.jpg", isPrimary: true });

      expect(prisma.productImage.updateMany).toHaveBeenCalledWith({
        where: { productId: "prod-1", variantId: null, isPrimary: true },
        data: { isPrimary: false },
      });
    });

    it("updateImage moving a primary photo back to the general gallery (variantId: null) demotes the gallery's primary, not the old variant's", async () => {
      prisma.productImage.findUnique.mockResolvedValue({ productId: "prod-1", variantId: "var-1" });
      prisma.productImage.update.mockResolvedValue({
        id: "img-1",
        productId: "prod-1",
        variantId: null,
        url: "https://cdn.example.com/a.jpg",
        altText: null,
        position: 0,
        isPrimary: true,
      });

      await service.updateImage("prod-1", "img-1", { variantId: null, isPrimary: true });

      expect(prisma.productImage.updateMany).toHaveBeenCalledWith({
        where: { productId: "prod-1", variantId: null, isPrimary: true, NOT: { id: "img-1" } },
        data: { isPrimary: false },
      });
    });

    it("removeImage 404s when the image belongs to a different product", async () => {
      prisma.productImage.findUnique.mockResolvedValue({ productId: "other-product" });

      await expect(service.removeImage("prod-1", "img-1")).rejects.toThrow(
        "Image not found for this product",
      );
      expect(prisma.productImage.delete).not.toHaveBeenCalled();
    });
  });
});
