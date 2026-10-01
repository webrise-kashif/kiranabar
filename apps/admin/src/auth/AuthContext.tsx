import type { PublicUser } from "@kiranabar/types";
import type { LoginInput } from "@kiranabar/validation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient, onSessionExpired } from "../lib/api-client";
import { AuthContext } from "./auth-context";

/**
 * Thin wrapper around the auth endpoints -- holds the current user in
 * React state and delegates every decision (credential validity, role) to
 * the backend. No token handling here: the browser's httpOnly cookies do
 * that.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ user: PublicUser }>("/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // A request's 401 survives auto-refresh (see lib/api-client.ts) only when
  // the session is genuinely gone -- fall back to the login screen instead
  // of leaving the UI claiming a signed-in user every action then fails for.
  useEffect(() => onSessionExpired(() => setUser(null)), []);

  const login = useCallback(async (input: LoginInput) => {
    const result = await apiClient.post<{ user: PublicUser }>("/auth/login", input);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await apiClient.post("/auth/logout", {});
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
