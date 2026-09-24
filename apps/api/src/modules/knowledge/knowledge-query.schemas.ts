import { z } from 'zod';

export const knowledgeSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'O parâmetro "q" é obrigatório.').max(200),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
export type KnowledgeSearchQuery = z.infer<typeof knowledgeSearchQuerySchema>;
