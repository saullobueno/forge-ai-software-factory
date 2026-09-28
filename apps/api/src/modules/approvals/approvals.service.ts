import { Injectable } from '@nestjs/common';
import { hasPermission } from '@forge/domain';
import type { MemberRole } from '@forge/types';
import { ApprovalsRepository, type PendingApproval } from './approvals.repository.js';

/**
 * Painel cross-execução de aprovações pendentes (Fase 17 continuação #2,
 * PROGRESS.md "O que falta" — "um painel 'aprovações pendentes'
 * cross-execução... exigiria isso"). Agrega os dois tipos de `approvals`
 * que hoje existem (`agent_run`, `deployment`) numa única lista ordenada
 * por antiguidade (mais antiga primeiro — o mesmo critério de "o que está
 * esperando decisão há mais tempo" que uma fila de trabalho usaria).
 *
 * **Decisão de permissão (não óbvia)**: o controller exige
 * `agent_run:approve` OU `environment:approve_deployment` (ver
 * `ApprovalsController`) para ENTRAR no endpoint — mas dentro dele, cada
 * sub-lista só é incluída se a role do usuário de fato tiver a permissão
 * correspondente para DECIDIR aquele tipo de item. Um `tech_lead`
 * (`agent_run:approve`, nunca `environment:approve_deployment`) só vê
 * execuções de agente pendentes; só `admin` (único papel com as duas) vê
 * as duas listas juntas. Isso evita reaproveitar uma permissão só para
 * "ver" que já implica "decidir" em outro lugar da API (`POST
 * /agent-runs/:id/approve` e `.../deployments/:id/approve` já usam essas
 * mesmas permissões) — a listagem nunca mostra a alguém um item que ele
 * não teria autorização de decidir se clicasse.
 */
@Injectable()
export class ApprovalsService {
  constructor(private readonly approvalsRepository: ApprovalsRepository) {}

  async listPending(organizationId: string, role: MemberRole): Promise<PendingApproval[]> {
    const [agentRunApprovals, deploymentApprovals] = await Promise.all([
      hasPermission(role, 'agent_run:approve')
        ? this.approvalsRepository.listPendingAgentRunApprovals(organizationId)
        : Promise.resolve([]),
      hasPermission(role, 'environment:approve_deployment')
        ? this.approvalsRepository.listPendingDeploymentApprovals(organizationId)
        : Promise.resolve([]),
    ]);

    return [...agentRunApprovals, ...deploymentApprovals].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }
}
