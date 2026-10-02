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
    // 100 is the API's pageSize maximum -- enough for a filter dropdown.
    fetchCategories: () =>
      apiClient.get<PaginatedResult<Category>>("/categories", { query: { pageSize: 100 } }),
  };
}
