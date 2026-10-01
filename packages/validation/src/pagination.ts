import { z } from "zod";

/**
 * Shared shape for paginated list requests. Used server-side (NestJS request
 * validation) and client-side (query building / form validation) so both
 * sides of the contract stay in sync.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
