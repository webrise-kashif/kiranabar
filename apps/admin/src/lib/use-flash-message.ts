import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

interface FlashLocationState {
  message?: string;
}

/**
 * Reads a one-time success message passed via router state (e.g. after a
 * redirect from a create form) and clears it from history so it doesn't
 * reappear on refresh or when navigating back to this page.
 */
export function useFlashMessage(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [message] = useState<string | null>(() => {
    const state = location.state as FlashLocationState | null;
    return state?.message ?? null;
  });

  useEffect(() => {
    if (message) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [message, navigate, location.pathname]);

  return message;
}
