import type { PaginatedResult } from "@kiranabar/types";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "./api-client";

type Query = Record<string, string | number | boolean | undefined>;

/**
 * Shared list-fetching shape for every admin list page (products,
 * categories, orders, users) -- identical loading/error/refetch pattern,
 * only the path and query differ. `query` should be a stable/memoized
 * object (or built inline from primitives) since it's compared by its
 * JSON representation to decide when to refetch.
 */
export function usePaginatedList<T>(
  path: string,
  query: Query,
): {
  data: PaginatedResult<T> | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<PaginatedResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.get<PaginatedResult<T>>(path, { query });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey stands in for query
  }, [path, queryKey, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { data, loading, error, refetch };
}
