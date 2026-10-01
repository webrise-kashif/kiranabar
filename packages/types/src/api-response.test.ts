import { describe, expect, it } from "vitest";
import { isApiErrorResponse, type ApiResponse } from "./api-response";

describe("isApiErrorResponse", () => {
  it("returns true for an error envelope", () => {
    const response: ApiResponse<{ id: string }> = {
      error: { code: "NOT_FOUND", message: "Not found" },
    };

    expect(isApiErrorResponse(response)).toBe(true);
  });

  it("returns false for a success envelope", () => {
    const response: ApiResponse<{ id: string }> = {
      data: { id: "123" },
    };

    expect(isApiErrorResponse(response)).toBe(false);
  });
});
