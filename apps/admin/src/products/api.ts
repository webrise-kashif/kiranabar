import type { Product, ProductImage, ProductInventory, ProductVariant } from "@kiranabar/types";
import type {
  AdjustInventoryInput,
  CreateProductImageInput,
  CreateProductInput,
  CreateProductVariantInput,
  UpdateProductImageInput,
  UpdateProductInput,
  UpdateProductVariantInput,
} from "@kiranabar/validation";
import { apiClient } from "../lib/api-client";

export function fetchProduct(id: string): Promise<Product> {
  return apiClient.get<Product>(`/products/${id}`);
}

export function createProduct(input: CreateProductInput): Promise<Product> {
  return apiClient.post<Product>("/products", input);
}

export function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  return apiClient.patch<Product>(`/products/${id}`, input);
}

/** Soft delete -- sets status to ARCHIVED. See docs/database.md. */
export function archiveProduct(id: string): Promise<Product> {
  return apiClient.delete<Product>(`/products/${id}`);
}

/** Hard delete -- only allowed once the product is already ARCHIVED. See docs/architecture.md. */
export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/products/${id}/permanent`);
}

export function addProductImage(
  productId: string,
  input: CreateProductImageInput,
): Promise<ProductImage> {
  return apiClient.post<ProductImage>(`/products/${productId}/images`, input);
}

export function updateProductImage(
  productId: string,
  imageId: string,
  input: UpdateProductImageInput,
): Promise<ProductImage> {
  return apiClient.patch<ProductImage>(`/products/${productId}/images/${imageId}`, input);
}

export async function removeProductImage(productId: string, imageId: string): Promise<void> {
  await apiClient.delete(`/products/${productId}/images/${imageId}`);
}

export function fetchInventory(productId: string): Promise<ProductInventory> {
  return apiClient.get<ProductInventory>(`/products/${productId}/inventory`);
}

export function adjustInventory(
  productId: string,
  input: AdjustInventoryInput,
): Promise<ProductInventory> {
  return apiClient.patch<ProductInventory>(`/products/${productId}/inventory`, input);
}

export function createProductVariant(
  productId: string,
  input: CreateProductVariantInput,
): Promise<ProductVariant> {
  return apiClient.post<ProductVariant>(`/products/${productId}/variants`, input);
}

export function updateProductVariant(
  productId: string,
  variantId: string,
  input: UpdateProductVariantInput,
): Promise<ProductVariant> {
  return apiClient.patch<ProductVariant>(`/products/${productId}/variants/${variantId}`, input);
}

/** Soft delete -- sets status to ARCHIVED. See docs/database.md. */
export function archiveProductVariant(
  productId: string,
  variantId: string,
): Promise<ProductVariant> {
  return apiClient.delete<ProductVariant>(`/products/${productId}/variants/${variantId}`);
}

/** Hard delete -- only allowed once the variant is already ARCHIVED. See docs/architecture.md. */
export async function deleteProductVariant(productId: string, variantId: string): Promise<void> {
  await apiClient.delete(`/products/${productId}/variants/${variantId}/permanent`);
}

export function fetchVariantInventory(
  productId: string,
  variantId: string,
): Promise<ProductInventory> {
  return apiClient.get<ProductInventory>(`/products/${productId}/variants/${variantId}/inventory`);
}

export function adjustVariantInventory(
  productId: string,
  variantId: string,
  input: AdjustInventoryInput,
): Promise<ProductInventory> {
  return apiClient.patch<ProductInventory>(
    `/products/${productId}/variants/${variantId}/inventory`,
    input,
  );
}
