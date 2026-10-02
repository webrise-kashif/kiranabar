import { ApiClientError } from "@kiranabar/api-client";
import type { Category, PaginatedResult, Product } from "@kiranabar/types";

export type CatalogQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
};

/**
 * Read-only catalog calls for the storefront. The API already limits an
 * anonymous or CUSTOMER caller to ACTIVE products and categories, so
 * nothing here filters by status.
 */
export function useCatalog() {
  const apiClient = useApiClient();

  return {
    fetchProducts: (query: CatalogQuery) =>
      apiClient.get<PaginatedResult<Product>>("/products", { query }),
    /** `null` when there's no such (visible) product -- the API answers 404. */
    fetchProduct: async (slug: string): Promise<Product | null> => {
      try {
        return await apiClient.get<Product>(`/products/${encodeURIComponent(slug)}`);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    // 100 is the API's pageSize maximum -- enough for a filter dropdown.
    fetchCategories: () =>
      apiClient.get<PaginatedResult<Category>>("/categories", { query: { pageSize: 100 } }),
  };
}
