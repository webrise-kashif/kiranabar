import type { Category, PaginatedResult } from "@kiranabar/types";
import { useEffect, useState } from "react";
import { apiClient } from "./api-client";

/** Small, flat option list for a category <select> -- shared by the product and category forms. */
export function useCategoryOptions(): { options: Category[]; loading: boolean } {
  const [options, setOptions] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<PaginatedResult<Category>>("/categories", { query: { pageSize: 100 } })
      .then((result) => {
        if (!cancelled) setOptions(result.items);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { options, loading };
}
