import {
  Catch,
  HttpException,
  HttpStatus,
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
 * Normalizes every thrown error (Nest HttpExceptions, Zod validation
 * failures, unexpected errors) into the shared `{ error }` envelope so
 * clients never have to branch on response shape.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const parsedBody: HttpExceptionBody | undefined =
      typeof body === "object" && body !== null ? (body as HttpExceptionBody) : undefined;

    const message =
      parsedBody?.message ??
      (typeof body === "string" ? body : undefined) ??
      (exception instanceof Error ? exception.message : "Internal server error");

    const errorResponse: ApiErrorResponse = {
      error: {
        // Always the UPPER_SNAKE status name (e.g. "NOT_FOUND"), never Nest's
        // human-readable `error` phrase ("Not Found"), so clients can match
        // on one stable format.
        code: HttpStatus[status] ?? "INTERNAL_SERVER_ERROR",
        message: Array.isArray(message) ? message.join(", ") : message,
        details: parsedBody?.errors ?? (Array.isArray(message) ? message : undefined),
      },
    };

    response.status(status).json(errorResponse);
  }
}
