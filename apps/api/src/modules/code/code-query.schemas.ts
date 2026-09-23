import { z } from 'zod';

export const filePathQuerySchema = z.object({
  path: z.string().trim().min(1, 'O parâmetro "path" é obrigatório.'),
});
export type FilePathQuery = z.infer<typeof filePathQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'O parâmetro "q" é obrigatório.'),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
