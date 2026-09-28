import { Injectable } from '@nestjs/common';
import { and, desc, eq, schema } from '@forge/database';
import type { ApprovalStatus } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type ApprovalRow = typeof schema.approvals.$inferSelect;

export interface CreatePendingAgentRunApprovalInput {
  organizationId: string;
  agentRunId: string;
  requestedByUserId: string | null;
}

export interface DecideAgentRunApprovalInput {
  status: Extract<ApprovalStatus, 'approved' | 'rejected'>;
  approvedByUserId: string;
  reason: string | null;
}

/**
 * Camada de acesso a dados para a decisão humana sobre um `agentRun`
 * (spec §9/§18) — reaproveita a tabela polimórfica `approvals` já existente
 * (`packages/database/src/schema/approvals.ts`, criada para ambientes
 * protegidos/ações destrutivas) fixando `subjectType: 'agent_run'`.
 *
 * **Fase 17 continuação #2 — mesmo padrão de `EnvironmentsRepository`
 * (deployments)**: a linha nasce `pending` no momento em que a execução
 * ENTRA em `approval_required` (`createPending`, chamado por
 * `AgentRunOrchestrationStore.createPendingApproval`, por sua vez chamado
 * por `AgentRunOrchestrator.finishPipeline` — nunca aqui diretamente, esta
 * classe só persiste), e decidir (`decide`) é um UPDATE na MESMA linha, não
 * um INSERT de uma linha nova já decidida como esta classe fazia antes
 * desta continuação. Isso torna o estado "aguardando decisão humana"
 * consultável via uma linha própria em `approvals` (`status = 'pending'`),
 * não só via `agentRun.status`/`toolCall.status` — pré-requisito do painel
 * cross-execução `GET /approvals/pending` (`apps/api/src/modules/approvals/`).
 */
@Injectable()
export class AgentRunApprovalsRepository {
  constructor(private readonly database: DatabaseService) {}

  async createPending(input: CreatePendingAgentRunApprovalInput): Promise<ApprovalRow> {
    const [created] = await this.database.db
      .insert(schema.approvals)
      .values({
        organizationId: input.organizationId,
        subjectType: 'agent_run',
        subjectId: input.agentRunId,
        status: 'pending',
        requestedByUserId: input.requestedByUserId,
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir approval pendente de agent_run.');
    return created;
  }

  /**
   * A `approval` `pending` mais recente para este `agentRun` — mesmo padrão
   * de `EnvironmentsRepository.findPendingApprovalForDeployment`. Normalmente
   * há no máximo uma (criada uma vez por `createPending` quando a execução
   * entra em `approval_required`), mas `orderBy desc` garante que uma
   * decisão sempre resolve a mais recente caso o dado histórico tenha mais
   * de uma por algum motivo.
   */
  async findPendingByAgentRunId(agentRunId: string, organizationId: string): Promise<ApprovalRow | undefined> {
    return this.database.db.query.approvals.findFirst({
      where: and(
        eq(schema.approvals.organizationId, organizationId),
        eq(schema.approvals.subjectType, 'agent_run'),
        eq(schema.approvals.subjectId, agentRunId),
        eq(schema.approvals.status, 'pending'),
      ),
      orderBy: [desc(schema.approvals.createdAt), desc(schema.approvals.id)],
    });
  }

  /**
   * Decide a `approval` pendente já existente (UPDATE, não INSERT) — mesmo
   * padrão de `EnvironmentsRepository.decideDeploymentApproval`. `reason`:
   * se quem decide informar um motivo, ele substitui o motivo original (não
   * há coluna separada para "motivo do pedido" vs. "motivo da decisão" —
   * neste fluxo específico o pedido nunca tem motivo próprio, então isso na
   * prática só grava o motivo da decisão).
   */
  async decide(approvalId: string, organizationId: string, input: DecideAgentRunApprovalInput): Promise<ApprovalRow> {
    const [updated] = await this.database.db
      .update(schema.approvals)
      .set({
        status: input.status,
        approvedByUserId: input.approvedByUserId,
        reason: input.reason,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.approvals.id, approvalId), eq(schema.approvals.organizationId, organizationId)))
      .returning();
    if (!updated) throw new Error('Falha ao decidir approval de agent_run.');
    return updated;
  }
}
