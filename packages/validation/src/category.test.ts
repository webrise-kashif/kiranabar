import { describe, expect, it } from "vitest";
import { categoryQuerySchema, createCategorySchema, updateCategorySchema } from "./category";

describe("createCategorySchema", () => {
  it("accepts a minimal valid category and defaults status to DRAFT", () => {
    const result = createCategorySchema.parse({ name: "Apparel", slug: "apparel" });

    expect(result.status).toBe("DRAFT");
  });

  it("lowercases and trims the slug", () => {
    const result = createCategorySchema.parse({ name: "Apparel", slug: " Apparel " });

    expect(result.slug).toBe("apparel");
  });

  it("rejects a slug with invalid characters", () => {
    expect(() => createCategorySchema.parse({ name: "Apparel", slug: "Apparel_1!" })).toThrow();
  });

  it("rejects a missing name", () => {
    expect(() => createCategorySchema.parse({ slug: "apparel" })).toThrow();
  });

  it("accepts an optional parentId", () => {
    const result = createCategorySchema.parse({
      name: "Shirts",
      slug: "shirts",
      parentId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(result.parentId).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
});

describe("updateCategorySchema", () => {
  it("allows a partial update", () => {
    expect(updateCategorySchema.parse({ status: "ACTIVE" })).toEqual({ status: "ACTIVE" });
  });
});

describe("categoryQuerySchema", () => {
  it("applies pagination defaults and allows optional filters", () => {
    const result = categoryQuerySchema.parse({});

    expect(result).toMatchObject({ page: 1, pageSize: 20 });
  });
});
