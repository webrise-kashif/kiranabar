import { isApiErrorResponse, type ApiResponse } from "@kiranabar/types";
import { ApiClientError } from "./api-client-error";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  /** Base URL of the backend API, e.g. "https://api.example.com/api/v1". */
  baseUrl: string;
  /**
   * Web clients (Web Store, Admin Portal) authenticate via httpOnly cookies
   * set by the backend. Set true to send them with every request.
   */
  useCredentials?: boolean;
  /**
   * Non-browser clients (React Native) authenticate via a bearer token
   * instead of cookies. Supply an accessor so the client always reads the
   * latest token (e.g. from secure device storage).
   */
  getAccessToken?: () => string | null | Promise<string | null>;
  /** Invoked when the backend responds 401 and (if `autoRefresh` was attempted) refreshing didn't recover the session, so the caller can react (redirect to login, clear stored tokens, etc). */
  onUnauthorized?: () => void | Promise<void>;
  /**
   * On a 401, POST `/auth/refresh` (same credentials transport as every
   * other request -- the httpOnly refresh-token cookie for web clients)
   * and, if that succeeds, retry the original request once before falling
   * back to `onUnauthorized`. Concurrent 401s share a single in-flight
   * refresh. See docs/authentication.md. Only meaningful for cookie-based
   * (`useCredentials: true`) clients today -- the future bearer-token
   * mobile client will need its own handling once it exists.
   */
  autoRefresh?: boolean;
  /** Override for the fetch implementation, primarily for testing. */
  fetch?: typeof fetch;
}

export interface ApiClient {
  get<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;
  delete<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}

function buildUrl(baseUrl: string, path: string, query?: ApiRequestOptions["query"]): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ""), base);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

/**
 * Framework-independent HTTP client for the backend REST API. Wrapped by
 * Nuxt composables, React hooks, and (in the future) React Native hooks --
 * this module itself must never import a UI framework.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  /**
   * Looked up fresh on every call (not captured once here) so a caller
   * that swaps `globalThis.fetch` after constructing this client -- e.g. a
   * test stubbing it post-import -- still takes effect.
   */
  function getFetchImpl(): typeof fetch {
    return options.fetch ?? fetch;
  }

  /** Dedupes concurrent 401s behind a single in-flight refresh call. */
  let refreshPromise: Promise<boolean> | null = null;

  function refreshAccessToken(): Promise<boolean> {
    refreshPromise ??= getFetchImpl()(buildUrl(options.baseUrl, "/auth/refresh"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: options.useCredentials ? "include" : "same-origin",
      body: "{}",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  }

  async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    requestOptions?: ApiRequestOptions,
    isRetry = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...requestOptions?.headers,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (options.getAccessToken) {
      const token = await options.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const response = await getFetchImpl()(buildUrl(options.baseUrl, path, requestOptions?.query), {
      method,
      headers,
      credentials: options.useCredentials ? "include" : "same-origin",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: requestOptions?.signal,
    });

    if (response.status === 401) {
      if (options.autoRefresh && !isRetry && path !== "/auth/refresh") {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return request<T>(method, path, body, requestOptions, true);
        }
      }
      await options.onUnauthorized?.();
    }

    const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;

    if (!response.ok || !payload || isApiErrorResponse(payload)) {
      const errorPayload = payload && isApiErrorResponse(payload) ? payload.error : undefined;
      throw new ApiClientError(
        errorPayload?.message ?? response.statusText,
        response.status,
        errorPayload?.code,
        errorPayload?.details,
      );
    }

    return payload.data;
  }

  return {
    get: (path, requestOptions) => request("GET", path, undefined, requestOptions),
    post: (path, body, requestOptions) => request("POST", path, body, requestOptions),
    put: (path, body, requestOptions) => request("PUT", path, body, requestOptions),
    patch: (path, body, requestOptions) => request("PATCH", path, body, requestOptions),
    delete: (path, requestOptions) => request("DELETE", path, undefined, requestOptions),
  };
}
