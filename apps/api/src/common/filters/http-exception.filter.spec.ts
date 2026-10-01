import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
} from "@nestjs/common";
import type { ApiErrorResponse } from "@kiranabar/types";
import { ZodValidationException } from "nestjs-zod";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpExceptionFilter } from "./http-exception.filter";

function catchWithFilter(exception: unknown): { status: number; body: ApiErrorResponse } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(exception, host);

  return {
    status: status.mock.calls[0]?.[0] as number,
    body: json.mock.calls[0]?.[0] as ApiErrorResponse,
  };
}

describe("HttpExceptionFilter", () => {
  it("puts Zod validation issues in error.details", () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: "nope" });
    if (result.success) throw new Error("fixture should fail validation");

    const { status, body } = catchWithFilter(new ZodValidationException(result.error));

    expect(status).toBe(400);
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toBe("Validation failed");
    expect(body.error.details).toEqual(result.error.issues);
  });

  it("leaves details undefined for a plain HttpException", () => {
    const { status, body } = catchWithFilter(new NotFoundException("Product not found"));

    expect(status).toBe(404);
    expect(body.error).toEqual({
      code: "NOT_FOUND",
      message: "Product not found",
      details: undefined,
    });
  });

  it.each([
    [new BadRequestException("Cart is empty"), 400, "BAD_REQUEST"],
    [new UnauthorizedException("Invalid email or password"), 401, "UNAUTHORIZED"],
    [new ForbiddenException("You do not have permission"), 403, "FORBIDDEN"],
    [new ConflictException("A product with this SKU already exists"), 409, "CONFLICT"],
  ])("uses the UPPER_SNAKE status name as the code for %s", (exception, expectedStatus, code) => {
    const { status, body } = catchWithFilter(exception);

    expect(status).toBe(expectedStatus);
    expect(body.error.code).toBe(code);
  });

  it("reports an unexpected error as INTERNAL_SERVER_ERROR", () => {
    const { status, body } = catchWithFilter(new Error("boom"));

    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
