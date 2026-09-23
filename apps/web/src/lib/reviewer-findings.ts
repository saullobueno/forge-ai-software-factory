import { findingSeveritySchema } from '@forge/types';
import { z } from 'zod';

/**
 * Formato dos findings estruturados que o `reviewer` grava em
 * `agentSteps.output.findings` (spec §11: severidade, arquivo/linha,
 * explicação, evidência, remediação sugerida; `status` distingue problema
 * confirmado de hipótese). Não existe tabela dedicada no schema (spec
 * §16) — é jsonb livre do lado do backend, então o frontend nunca faz um
 * cast direto: valida com zod e cai para a exibição de JSON bruto (ver
 * `agent-run-view.tsx`) se o formato não bater.
 */
export const reviewerFindingSchema = z.object({
  id: z.string(),
  severity: findingSeveritySchema,
  file: z.string(),
  line: z.number(),
  title: z.string(),
  explanation: z.string(),
  evidence: z.string(),
  suggestedRemediation: z.string(),
  status: z.enum(['confirmed', 'hypothesis']),
});
export type ReviewerFinding = z.infer<typeof reviewerFindingSchema>;

const reviewerOutputSchema = z.object({
  findings: z.array(reviewerFindingSchema),
});

/**
 * Extrai os findings de `agentSteps.output` de um step do `reviewer`,
 * retornando `null` quando o formato não bate (output vazio, de uma
 * execução mais antiga, ou de um formato inesperado) — nunca lança, quem
 * chama decide o fallback.
 */
export function parseReviewerFindings(output: Record<string, unknown> | null): ReviewerFinding[] | null {
  if (!output) return null;
  const result = reviewerOutputSchema.safeParse(output);
  return result.success ? result.data.findings : null;
}
