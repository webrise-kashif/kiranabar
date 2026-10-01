import type { PublicUser } from "@kiranabar/types";
import type { LoginInput, RegisterInput } from "@kiranabar/validation";

/**
 * Thin wrapper around the auth endpoints -- holds the current user as
 * shared, SSR-safe state (`useState`) and delegates every decision
 * (whether credentials are valid, what role a user has) to the backend.
 * No token handling here: the browser's httpOnly cookies do that.
 */
export function useAuth() {
  const apiClient = useApiClient();
  // Key also used by useApiClient() to clear this on a session that
  // survives auto-refresh (see there) -- keep the two in sync if renamed.
  const user = useState<PublicUser | null>("auth-user", () => null);

  async function register(input: RegisterInput): Promise<PublicUser> {
    const result = await apiClient.post<{ user: PublicUser }>("/auth/register", input);
    user.value = result.user;
    return result.user;
  }

  async function login(input: LoginInput): Promise<PublicUser> {
    const result = await apiClient.post<{ user: PublicUser }>("/auth/login", input);
    user.value = result.user;
    return result.user;
  }

  async function logout(): Promise<void> {
    await apiClient.post("/auth/logout", {});
    user.value = null;
  }

  async function fetchCurrentUser(): Promise<PublicUser | null> {
    try {
      const result = await apiClient.get<{ user: PublicUser }>("/auth/me");
      user.value = result.user;
    } catch {
      user.value = null;
    }
    return user.value;
  }

  return { user, register, login, logout, fetchCurrentUser };
}
