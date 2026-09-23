import { z } from 'zod';

export const idSchema = z.string().uuid();

export const timestampsSchema = z.object({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const paginationRequestSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type PaginationRequest = z.infer<typeof paginationRequestSchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
