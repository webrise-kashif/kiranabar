import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { toProduct, toProductVariant } from "./product.mapper";

const BASE_PRODUCT = {
  id: "prod-1",
  name: "Classic Tee",
  slug: "classic-tee",
  description: null,
  sku: "TSHIRT-001",
  salePrice: null,
  currency: "USD",
  status: "ACTIVE" as const,
  categoryId: null,
  category: null,
  images: [],
  inventory: null,
  variants: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const BASE_VARIANT = {
  id: "var-1",
  productId: "prod-1",
  sku: "TSHIRT-001-RED-M",
  salePrice: null,
  currency: "USD",
  attributes: { color: "Red", size: "M" },
  status: "ACTIVE" as const,
  images: [],
  inventory: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function buildImage(overrides: {
  id: string;
  url: string;
  position: number;
  isPrimary: boolean;
  variantId: string | null;
}) {
  return {
    ...overrides,
    productId: "prod-1",
    altText: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("toProduct", () => {
  it("formats a whole-number price with 2 decimal places, not decimal.js's trimmed toString()", () => {
    const result = toProduct({ ...BASE_PRODUCT, price: new Prisma.Decimal("10.00") });

    expect(result.price).toBe("10.00");
  });

  it("formats a whole-number salePrice with 2 decimal places", () => {
    const result = toProduct({
      ...BASE_PRODUCT,
      price: new Prisma.Decimal("25.00"),
      salePrice: new Prisma.Decimal("20.00"),
    });

    expect(result.salePrice).toBe("20.00");
  });

  it("preserves an already-2-decimal price", () => {
    const result = toProduct({ ...BASE_PRODUCT, price: new Prisma.Decimal("24.99") });

    expect(result.price).toBe("24.99");
  });

  it("returns null salePrice as null, not a formatted zero", () => {
    const result = toProduct({ ...BASE_PRODUCT, price: new Prisma.Decimal("10.00") });

    expect(result.salePrice).toBeNull();
  });

  it("maps nested variants and keeps variant-tagged images out of the general gallery", () => {
    const result = toProduct({
      ...BASE_PRODUCT,
      price: new Prisma.Decimal("24.99"),
      images: [
        buildImage({
          id: "img-1",
          url: "https://cdn.example.com/general.jpg",
          position: 0,
          isPrimary: true,
          variantId: null,
        }),
        buildImage({
          id: "img-2",
          url: "https://cdn.example.com/red.jpg",
          position: 0,
          isPrimary: false,
          variantId: "var-1",
        }),
      ],
      variants: [{ ...BASE_VARIANT, price: new Prisma.Decimal("26.99") }],
    });

    expect(result.images.map((image) => image.id)).toEqual(["img-1"]);
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]).toMatchObject({
      id: "var-1",
      sku: "TSHIRT-001-RED-M",
      price: "26.99",
      attributes: { color: "Red", size: "M" },
    });
  });
});

describe("toProductVariant", () => {
  it("formats price/salePrice with 2 decimal places", () => {
    const result = toProductVariant({
      ...BASE_VARIANT,
      price: new Prisma.Decimal("15.00"),
      salePrice: new Prisma.Decimal("12.50"),
    });

    expect(result.price).toBe("15.00");
    expect(result.salePrice).toBe("12.50");
  });

  it("sorts a variant's own images by position", () => {
    const result = toProductVariant({
      ...BASE_VARIANT,
      price: new Prisma.Decimal("15.00"),
      images: [
        buildImage({
          id: "img-b",
          url: "b.jpg",
          position: 1,
          isPrimary: false,
          variantId: "var-1",
        }),
        buildImage({ id: "img-a", url: "a.jpg", position: 0, isPrimary: true, variantId: "var-1" }),
      ],
    });

    expect(result.images.map((image) => image.id)).toEqual(["img-a", "img-b"]);
  });
});
