import { describe, expect, it } from "vitest";
import { paginationQuerySchema } from "./pagination";

describe("paginationQuerySchema", () => {
  it("applies defaults when nothing is provided", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("coerces string query params to numbers", () => {
    expect(paginationQuerySchema.parse({ page: "2", pageSize: "10" })).toEqual({
      page: 2,
      pageSize: 10,
    });
  });

  it("rejects a pageSize above the maximum", () => {
    expect(() => paginationQuerySchema.parse({ pageSize: 1000 })).toThrow();
  });
});
