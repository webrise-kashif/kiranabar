import { createApiClient } from "@kiranabar/api-client";

/**
 * Fired when a request 401s and (if `autoRefresh` couldn't recover it) the
 * session is really gone -- AuthContext subscribes to clear the signed-in
 * user so the app falls back to the login screen instead of silently
 * failing every subsequent request. Plain listener set, not a dependency,
 * since this module is imported by every domain module (products,
 * categories, ...) that must never import React state directly.
 */
const sessionExpiredListeners = new Set<() => void>();

export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

/**
 * The one shared client instance for the whole Admin Portal -- AuthContext
 * and every domain module (products/categories/orders/users) import this
 * instead of constructing their own, so base URL and auth transport
 * configuration live in exactly one place.
 */
export const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1",
  // Admin Portal is a browser client; it authenticates via httpOnly cookies.
  useCredentials: true,
  // The access token cookie is short-lived (15m by default); silently
  // refresh it on a 401 instead of surfacing a confusing "unauthorized"
  // error mid-session. See docs/authentication.md.
  autoRefresh: true,
  onUnauthorized: () => {
    sessionExpiredListeners.forEach((listener) => listener());
  },
});
