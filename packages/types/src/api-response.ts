/**
 * Envelope shapes shared by every backend response, regardless of which
 * client (Web Store, Admin Portal, or the future React Native app) consumes it.
 */

export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function isApiErrorResponse<T>(response: ApiResponse<T>): response is ApiErrorResponse {
  return "error" in response;
}
