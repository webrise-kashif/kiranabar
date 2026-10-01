import type { Category } from "@kiranabar/types";
import type { CreateCategoryInput, UpdateCategoryInput } from "@kiranabar/validation";
import { apiClient } from "../lib/api-client";

export function fetchCategory(id: string): Promise<Category> {
  return apiClient.get<Category>(`/categories/${id}`);
}

export function createCategory(input: CreateCategoryInput): Promise<Category> {
  return apiClient.post<Category>("/categories", input);
}

export function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  return apiClient.patch<Category>(`/categories/${id}`, input);
}

/** Soft delete -- sets status to ARCHIVED. See docs/database.md. */
export function archiveCategory(id: string): Promise<Category> {
  return apiClient.delete<Category>(`/categories/${id}`);
}

/** Hard delete -- only allowed once the category is already ARCHIVED. See docs/architecture.md. */
export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/categories/${id}/permanent`);
}
