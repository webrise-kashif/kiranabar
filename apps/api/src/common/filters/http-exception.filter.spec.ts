import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
} from "@nestjs/common";
import type { ApiErrorResponse } from "@kiranabar/types";
import { ZodValidationException } from "nestjs-zod";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
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

  describe("unexpected (non-HTTP) errors", () => {
    const INTERNAL_DETAIL =
      "Invalid `prisma.order.findUnique()` invocation: connect ECONNREFUSED postgresql://kiranabar:hunter2@db:5432";

    let logError: MockInstance<Logger["error"]>;

    beforeEach(() => {
      logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
      logError.mockRestore();
    });

    it("reports an unexpected error as INTERNAL_SERVER_ERROR", () => {
      const { status, body } = catchWithFilter(new Error("boom"));

      expect(status).toBe(500);
      expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
    });

    it("never sends the internal error message to the client", () => {
      const { body } = catchWithFilter(new Error(INTERNAL_DETAIL));

      expect(body.error).toEqual({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
        details: undefined,
      });
      expect(JSON.stringify(body)).not.toContain("hunter2");
    });

    it("logs the original error with its stack trace on the server", () => {
      const error = new Error(INTERNAL_DETAIL);

      catchWithFilter(error);

      expect(logError).toHaveBeenCalledWith(INTERNAL_DETAIL, error.stack);
    });

    it("handles a thrown non-Error value the same way", () => {
      const { status, body } = catchWithFilter("raw string with internals");

      expect(status).toBe(500);
      expect(body.error.message).toBe("Internal server error");
      expect(logError).toHaveBeenCalledWith("raw string with internals", undefined);
    });
  });

  it("keeps the status and message of a client-safe Express/http-errors error (e.g. body too large)", () => {
    // Shape of the error body-parser raises for an oversized JSON body --
    // http-errors marks 4xx errors `expose: true` (safe to show the client).
    const tooLarge = Object.assign(new Error("request entity too large"), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: "entity.too.large",
    });

    const { status, body } = catchWithFilter(tooLarge);

    expect(status).toBe(413);
    expect(body.error).toEqual({
      code: "PAYLOAD_TOO_LARGE",
      message: "request entity too large",
      details: undefined,
    });
  });

  it("keeps the message of a deliberately thrown InternalServerErrorException", () => {
    const { status, body } = catchWithFilter(
      new InternalServerErrorException("Payment provider unavailable"),
    );

    expect(status).toBe(500);
    expect(body.error.message).toBe("Payment provider unavailable");
  });
});
