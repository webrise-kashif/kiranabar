import { describe, expect, it } from "vitest";
import {
  adjustInventorySchema,
  createProductImageSchema,
  createProductSchema,
  createProductVariantSchema,
  productQuerySchema,
  productVariantAttributesSchema,
  updateProductSchema,
  updateProductVariantSchema,
} from "./product";

const VALID_PRODUCT = {
  name: "Classic Tee",
  slug: "classic-tee",
  sku: "TSHIRT-001",
  price: "24.99",
};

describe("createProductSchema", () => {
  it("accepts a minimal valid product and defaults status/currency/quantity", () => {
    const result = createProductSchema.parse(VALID_PRODUCT);

    expect(result.status).toBe("DRAFT");
    expect(result.currency).toBe("USD");
    expect(result.initialQuantity).toBe(0);
  });

  it("rejects a price with more than 2 decimal places", () => {
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, price: "24.999" })).toThrow();
  });

  it("rejects a non-numeric price", () => {
    expect(() => createProductSchema.parse({ ...VALID_PRODUCT, price: "free" })).toThrow();
  });

  it("rejects a salePrice that is not less than price", () => {
    expect(() =>
      createProductSchema.parse({ ...VALID_PRODUCT, price: "10.00", salePrice: "10.00" }),
    ).toThrow(/salePrice must be less than price/);
    expect(() =>
      createProductSchema.parse({ ...VALID_PRODUCT, price: "10.00", salePrice: "12.00" }),
    ).toThrow(/salePrice must be less than price/);
  });

  it("accepts a valid salePrice below price", () => {
    const result = createProductSchema.parse({
      ...VALID_PRODUCT,
      price: "24.99",
      salePrice: "19.99",
    });

    expect(result.salePrice).toBe("19.99");
  });

  it("accepts nested initial images", () => {
    const result = createProductSchema.parse({
      ...VALID_PRODUCT,
      images: [{ url: "https://cdn.example.com/a.jpg", isPrimary: true }],
    });

    expect(result.images).toHaveLength(1);
  });
});

describe("updateProductSchema", () => {
  it("allows a partial update with a single field", () => {
    expect(updateProductSchema.parse({ status: "ACTIVE" })).toEqual({ status: "ACTIVE" });
  });

  it("rejects salePrice >= price when both are present in the same update", () => {
    expect(() => updateProductSchema.parse({ price: "10.00", salePrice: "15.00" })).toThrow(
      /salePrice must be less than price/,
    );
  });

  it("allows updating salePrice alone (checked against the stored price in the service layer)", () => {
    expect(updateProductSchema.parse({ salePrice: "5.00" })).toEqual({ salePrice: "5.00" });
  });

  it("allows explicitly clearing categoryId", () => {
    expect(updateProductSchema.parse({ categoryId: null })).toEqual({ categoryId: null });
  });
});

describe("createProductImageSchema", () => {
  it("rejects an invalid URL", () => {
    expect(() => createProductImageSchema.parse({ url: "not-a-url" })).toThrow();
  });
});

describe("productQuerySchema", () => {
  it("applies pagination defaults", () => {
    expect(productQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
  });
});

describe("productVariantAttributesSchema", () => {
  it("accepts a valid attribute map", () => {
    expect(productVariantAttributesSchema.parse({ color: "Red", size: "M" })).toEqual({
      color: "Red",
      size: "M",
    });
  });

  it("rejects an empty attribute map", () => {
    expect(() => productVariantAttributesSchema.parse({})).toThrow(
      /At least one attribute is required/,
    );
  });

  it("rejects more than 10 attributes", () => {
    const attributes = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`key${i}`, `value${i}`]),
    );
    expect(() => productVariantAttributesSchema.parse(attributes)).toThrow(
      /At most 10 attributes are allowed/,
    );
  });
});

const VALID_VARIANT = {
  sku: "TSHIRT-001-RED-M",
  price: "24.99",
  attributes: { color: "Red", size: "M" },
};

describe("createProductVariantSchema", () => {
  it("accepts a minimal valid variant and defaults status/currency/quantity", () => {
    const result = createProductVariantSchema.parse(VALID_VARIANT);

    expect(result.status).toBe("ACTIVE");
    expect(result.currency).toBe("USD");
    expect(result.initialQuantity).toBe(0);
  });

  it("rejects a salePrice that is not less than price", () => {
    expect(() =>
      createProductVariantSchema.parse({ ...VALID_VARIANT, price: "10.00", salePrice: "10.00" }),
    ).toThrow(/salePrice must be less than price/);
  });

  it("rejects a variant with no attributes", () => {
    expect(() => createProductVariantSchema.parse({ ...VALID_VARIANT, attributes: {} })).toThrow();
  });
});

describe("updateProductVariantSchema", () => {
  it("allows a partial update with a single field", () => {
    expect(updateProductVariantSchema.parse({ status: "ARCHIVED" })).toEqual({
      status: "ARCHIVED",
    });
  });

  it("rejects salePrice >= price when both are present in the same update", () => {
    expect(() => updateProductVariantSchema.parse({ price: "10.00", salePrice: "15.00" })).toThrow(
      /salePrice must be less than price/,
    );
  });
});

describe("adjustInventorySchema", () => {
  it("requires version", () => {
    expect(() => adjustInventorySchema.parse({ quantityAvailable: 10 })).toThrow();
  });

  it("accepts a valid adjustment", () => {
    const result = adjustInventorySchema.parse({ quantityAvailable: 10, version: 3 });

    expect(result).toEqual({ quantityAvailable: 10, version: 3 });
  });
});
