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

  it("never injects create's default status into an update that doesn't mention it", () => {
    // Otherwise every rename would silently reset an ACTIVE category to DRAFT.
    expect(updateCategorySchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
  });

  it("accepts null to clear description and parentId (moving a category to the top level)", () => {
    expect(updateCategorySchema.parse({ description: null, parentId: null })).toEqual({
      description: null,
      parentId: null,
    });
  });

  it("still rejects null on create, where there is nothing to clear", () => {
    const base = { name: "Apparel", slug: "apparel" };

    expect(createCategorySchema.safeParse({ ...base, description: null }).success).toBe(false);
    expect(createCategorySchema.safeParse({ ...base, parentId: null }).success).toBe(false);
  });
});

describe("categoryQuerySchema", () => {
  it("applies pagination defaults and allows optional filters", () => {
    const result = categoryQuerySchema.parse({});

    expect(result).toMatchObject({ page: 1, pageSize: 20 });
  });
});
