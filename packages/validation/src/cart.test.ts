import { describe, expect, it } from "vitest";
import { addCartItemSchema, cartItemVariantQuerySchema, updateCartItemSchema } from "./cart";

describe("addCartItemSchema", () => {
  it("defaults quantity to 1", () => {
    const result = addCartItemSchema.parse({ productId: "123e4567-e89b-12d3-a456-426614174000" });

    expect(result.quantity).toBe(1);
  });

  it("rejects an invalid productId", () => {
    expect(() => addCartItemSchema.parse({ productId: "not-a-uuid" })).toThrow();
  });

  it("rejects a quantity of 0 or below", () => {
    expect(() =>
      addCartItemSchema.parse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        quantity: 0,
      }),
    ).toThrow();
  });

  it("rejects a quantity above 99", () => {
    expect(() =>
      addCartItemSchema.parse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        quantity: 100,
      }),
    ).toThrow();
  });

  it("accepts an optional variantId", () => {
    const result = addCartItemSchema.parse({
      productId: "123e4567-e89b-12d3-a456-426614174000",
      variantId: "223e4567-e89b-12d3-a456-426614174000",
    });

    expect(result.variantId).toBe("223e4567-e89b-12d3-a456-426614174000");
  });

  it("rejects an invalid variantId", () => {
    expect(() =>
      addCartItemSchema.parse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        variantId: "not-a-uuid",
      }),
    ).toThrow();
  });
});

describe("updateCartItemSchema", () => {
  it("requires a quantity", () => {
    expect(() => updateCartItemSchema.parse({})).toThrow();
  });

  it("accepts a valid quantity", () => {
    expect(updateCartItemSchema.parse({ quantity: 3 })).toEqual({ quantity: 3 });
  });
});

describe("cartItemVariantQuerySchema", () => {
  it("allows an absent variantId", () => {
    expect(cartItemVariantQuerySchema.parse({})).toEqual({});
  });

  it("accepts a valid variantId", () => {
    expect(
      cartItemVariantQuerySchema.parse({ variantId: "223e4567-e89b-12d3-a456-426614174000" }),
    ).toEqual({ variantId: "223e4567-e89b-12d3-a456-426614174000" });
  });

  it("rejects an invalid variantId", () => {
    expect(() => cartItemVariantQuerySchema.parse({ variantId: "not-a-uuid" })).toThrow();
  });
});
