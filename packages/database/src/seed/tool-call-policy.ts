import type { PolicyDecisionKind, ToolCallStatus } from '@forge/types';

/**
 * Mapeia a decisão de política real (`decideToolPolicy`/`authorizeToolCall`
 * de `@forge/domain`, spec §8/§18) para o status inicial coerente de um
 * ToolCall nesta demo determinística:
 *
 * - "allow" (ferramenta somente leitura/inspeção): roda e sucede de
 *   imediato — nunca passa por aprovação.
 * - "require_approval" (escreve código, roda comando, ou mexe em Git):
 *   só pode terminar "succeeded" se existir, na história contada pelos
 *   dados, uma Approval com status "approved" associada à execução que a
 *   autorizou — quem semeia os dados (`run-seed.ts`) é responsável por
 *   garantir essa Approval antes de usar "succeeded" aqui, e o teste de
 *   integração confirma que ela existe de verdade (não apenas que os
 *   enums "batem" no papel).
 * - "deny" (comando destrutivo ou ferramenta sem regra): nunca chega a
 *   rodar — a demo não modela uma tentativa de comando destrutivo, então
 *   este branch não é exercitado pelo seed, só documentado aqui por
 *   completude da função.
 */
export function toolCallStatusForPolicyDecision(decision: PolicyDecisionKind): ToolCallStatus {
  switch (decision) {
    case 'allow':
      return 'succeeded';
    case 'require_approval':
      return 'succeeded';
    case 'deny':
      return 'rejected';
  }
}
