import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { ApiSuccessResponse } from "@kiranabar/types";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";

/**
 * Wraps every successful controller response in the shared `{ data }`
 * envelope so all clients (Web Store, Admin Portal, future React Native app)
 * can rely on one response shape regardless of endpoint.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessResponse<T>> {
    return next.handle().pipe(map((data) => ({ data })));
  }
}
