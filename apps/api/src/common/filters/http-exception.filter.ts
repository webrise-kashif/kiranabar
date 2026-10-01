import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { ApiErrorResponse } from "@kiranabar/types";
import type { Response } from "express";

interface HttpExceptionBody {
  statusCode?: number;
  message?: string | string[];
  /** Set by nestjs-zod's ZodValidationException: the underlying Zod issues. */
  errors?: unknown;
}

/**
 * An error raised by Express/body-parser middleware (via http-errors) that
 * is explicitly marked safe to show the client -- http-errors sets
 * `expose: true` only on 4xx errors, e.g. a 413 for an oversized body.
 */
interface ClientSafeError extends Error {
  status: number;
  expose: true;
}

function isClientSafeError(exception: unknown): exception is ClientSafeError {
  return (
    exception instanceof Error &&
    "expose" in exception &&
    exception.expose === true &&
    "status" in exception &&
    typeof exception.status === "number" &&
    exception.status >= 400 &&
    exception.status < 500
  );
}

/**
 * Normalizes every thrown error (Nest HttpExceptions, Zod validation
 * failures, client-safe middleware errors, unexpected errors) into the
 * shared `{ error }` envelope so clients never have to branch on response
 * shape.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const parsedBody: HttpExceptionBody | undefined =
        typeof body === "object" && body !== null ? (body as HttpExceptionBody) : undefined;
      const message =
        parsedBody?.message ?? (typeof body === "string" ? body : undefined) ?? exception.message;

      send(
        response,
        exception.getStatus(),
        Array.isArray(message) ? message.join(", ") : message,
        parsedBody?.errors ?? (Array.isArray(message) ? message : undefined),
      );
      return;
    }

    if (isClientSafeError(exception)) {
      send(response, exception.status, exception.message);
      return;
    }

    // Anything else wasn't written to be shown to a client -- its message
    // can carry internals (SQL, connection strings, file paths). Log it in
    // full here; send only a generic 500.
    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    send(response, HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
  }
}

function send(response: Response, status: number, message: string, details?: unknown): void {
  const errorResponse: ApiErrorResponse = {
    error: {
      // Always the UPPER_SNAKE status name (e.g. "NOT_FOUND"), never Nest's
      // human-readable `error` phrase ("Not Found"), so clients can match
      // on one stable format.
      code: HttpStatus[status] ?? "INTERNAL_SERVER_ERROR",
      message,
      details,
    },
  };

  response.status(status).json(errorResponse);
}
