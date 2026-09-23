import type { AgentRole, AgentRunStatus } from '@forge/types';

export interface PipelineStage {
  role: AgentRole;
  stepName: string;
  /** Status do AgentRun vigente enquanto este step roda (spec §9). */
  runStatus: AgentRunStatus;
}

/**
 * Ordem de pipeline do orquestrador (spec §8/§9): Planejar -> Inspecionar
 * código -> Implementar -> Documentar -> Testar -> Revisar -> (sempre)
 * Aprovação Necessária -> Concluída/mantém aguardando aprovação.
 *
 * Esta é a MESMA sequência narrativa já usada por
 * `packages/database/src/seed/agent-run-timeline.ts` para a execução demo
 * estática da Fase 3 (`DEMO_AGENT_STEP_ORDER`/`DEMO_STEP_RUN_STATUS`),
 * reproduzida aqui — não importada de lá — porque `@forge/database` é uma
 * camada mais baixa que não deveria depender de `@forge/agents` (Fase 7).
 * A ordem em si é a mesma decisão de produto documentada naquele arquivo:
 * o Documentation Agent roda logo após o Implementer (revisa a
 * documentação afetada pela mudança recém-proposta) e o Reviewer é sempre
 * o último papel automatizado antes do estado `approval_required` —
 * `code_explorer`, `implementer` e `documentation_agent` compartilham o
 * status `executing` (a spec só distingue Planejando/Executando/
 * Testando/Revisão no nível da execução, não um status por papel).
 */
export const AGENT_PIPELINE: readonly PipelineStage[] = [
  { role: 'planner', stepName: 'Planejar execução', runStatus: 'planning' },
  { role: 'code_explorer', stepName: 'Inspecionar repositório', runStatus: 'executing' },
  { role: 'implementer', stepName: 'Implementar alteração', runStatus: 'executing' },
  { role: 'documentation_agent', stepName: 'Revisar documentação afetada', runStatus: 'executing' },
  { role: 'test_engineer', stepName: 'Executar suíte de testes', runStatus: 'testing' },
  { role: 'reviewer', stepName: 'Revisar alteração e produzir findings', runStatus: 'review' },
];
