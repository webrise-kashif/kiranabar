import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

interface FlashLocationState {
  message?: string;
}

/**
 * Reads a one-time success message passed via router state (e.g. after a
 * redirect from a create form) and clears it from history so it doesn't
 * reappear on refresh or when navigating back to this page.
 *
 * Picks up a message on every navigation, not just on mount: a redirect can
 * land on the *same* component instance (e.g. /products/new -> /products/:id
 * both render ProductFormPage), which never remounts.
 */
export function useFlashMessage(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = (location.state as FlashLocationState | null)?.message ?? null;

  // Adjusting state during render when the navigation changes (React's
  // recommended alternative to setState inside an effect).
  const [flash, setFlash] = useState(() => ({ key: location.key, message: incoming }));
  if (incoming && flash.key !== location.key) {
    setFlash({ key: location.key, message: incoming });
  }

  useEffect(() => {
    if (incoming) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [incoming, navigate, location.pathname]);

  return flash.message;
}
