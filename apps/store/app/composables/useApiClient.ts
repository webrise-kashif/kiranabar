import { createApiClient } from "@kiranabar/api-client";
import type { PublicUser } from "@kiranabar/types";

/**
 * The one place the Web Store touches HTTP. Every page/component fetches
 * data through this instead of calling fetch()/$fetch() directly, so the
 * auth transport (cookies here, a bearer token on the future RN app) stays
 * centralized.
 */
export function useApiClient() {
  const config = useRuntimeConfig();
  // Key shared with useAuth()'s useState -- see the comment there.
  const user = useState<PublicUser | null>("auth-user", () => null);

  return createApiClient({
    baseUrl: config.public.apiBaseUrl,
    // Web Store is a browser client; it authenticates via httpOnly cookies.
    useCredentials: true,
    // The access token cookie is short-lived (15m by default); silently
    // refresh it on a 401 instead of surfacing a confusing "unauthorized"
    // error mid-session. See docs/authentication.md.
    autoRefresh: true,
    // Only reached once auto-refresh couldn't recover the session -- fall
    // back to signed-out instead of leaving stale user state around.
    onUnauthorized: () => {
      user.value = null;
    },
  });
}
