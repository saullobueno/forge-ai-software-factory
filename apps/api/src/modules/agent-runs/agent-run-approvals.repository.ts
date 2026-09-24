import { Injectable } from '@nestjs/common';
import { schema } from '@forge/database';
import type { ApprovalStatus } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type ApprovalRow = typeof schema.approvals.$inferSelect;

export interface CreateAgentRunApprovalInput {
  organizationId: string;
  agentRunId: string;
  status: Extract<ApprovalStatus, 'approved' | 'rejected'>;
  requestedByUserId: string | null;
  approvedByUserId: string;
  reason: string | null;
}

/**
 * Camada de acesso a dados para a decisão humana sobre um `agentRun`
 * (spec §9/§18) — reaproveita a tabela polimórfica `approvals` já existente
 * (`packages/database/src/schema/approvals.ts`, criada para ambientes
 * protegidos/ações destrutivas) fixando `subjectType: 'agent_run'`. Cada
 * decisão (aprovar ou rejeitar) grava uma linha nova, não atualiza uma
 * pendente — não existe hoje um fluxo que crie a `approval` em `pending`
 * antes da decisão (isso exigiria o orquestrador escrever nela, fora do
 * escopo desta tarefa); a linha aqui já nasce decidida, o que o schema
 * permite (`status` default é `pending`, mas não é obrigatório).
 */
@Injectable()
export class AgentRunApprovalsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateAgentRunApprovalInput): Promise<ApprovalRow> {
    const [created] = await this.database.db
      .insert(schema.approvals)
      .values({
        organizationId: input.organizationId,
        subjectType: 'agent_run',
        subjectId: input.agentRunId,
        status: input.status,
        requestedByUserId: input.requestedByUserId,
        approvedByUserId: input.approvedByUserId,
        reason: input.reason,
        decidedAt: new Date(),
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir approval.');
    return created;
  }
}
