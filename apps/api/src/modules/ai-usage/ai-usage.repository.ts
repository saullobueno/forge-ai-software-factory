import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type AiUsageRow = typeof schema.aiUsages.$inferSelect;
export type AiUsageWithStep = AiUsageRow & {
  agentStep: { durationMs: number | null } | null;
};

@Injectable()
export class AiUsageRepository {
  constructor(private readonly database: DatabaseService) {}

  async listRecentByOrganization(organizationId: string, limit = 500): Promise<AiUsageWithStep[]> {
    return this.database.db.query.aiUsages.findMany({
      where: eq(schema.aiUsages.organizationId, organizationId),
      orderBy: [desc(schema.aiUsages.createdAt), desc(schema.aiUsages.id)],
      limit,
      with: {
        agentStep: {
          columns: {
            durationMs: true,
          },
        },
      },
    });
  }

  async listByOrganizationSince(organizationId: string, since: Date, limit = 5_000): Promise<AiUsageRow[]> {
    return this.database.db.query.aiUsages.findMany({
      where: and(eq(schema.aiUsages.organizationId, organizationId), gt(schema.aiUsages.createdAt, since)),
      orderBy: [desc(schema.aiUsages.createdAt), desc(schema.aiUsages.id)],
      limit,
    });
  }

  /**
   * Equivalente de `listByOrganizationSince`, mas escopado por USUÁRIO
   * (Fase 13 continuação #7 — limites diários por usuário). `ai_usages`
   * não guarda nenhum identificador de usuário diretamente (só
   * `organizationId`) — a única coluna que identifica quem disparou a
   * execução vive em `agent_runs.requested_by_user_id` (Fase 13
   * continuação #7, populada em `AgentRunsRepository.create`), então o
   * filtro por usuário exige um JOIN explícito em vez de
   * `db.query.aiUsages.findMany` (a API relacional do Drizzle não
   * filtra por coluna de uma tabela relacionada sem uma subconsulta).
   * `innerJoin` é seguro aqui: toda linha de `ai_usages` gravada pelo
   * orquestrador real sempre tem `agentRunId` preenchido (ver
   * `AgentRunOrchestrationStore.recordAiUsage`); linhas sem `agentRunId`
   * (nenhuma hoje, mas a coluna é nullable) nunca poderiam ser atribuídas
   * a um usuário de qualquer forma, então ficarem de fora é correto, não
   * uma lacuna.
   */
  async listByUserSince(organizationId: string, userId: string, since: Date, limit = 5_000): Promise<AiUsageRow[]> {
    return this.database.db
      .select({
        id: schema.aiUsages.id,
        organizationId: schema.aiUsages.organizationId,
        agentRunId: schema.aiUsages.agentRunId,
        agentStepId: schema.aiUsages.agentStepId,
        aiMessageId: schema.aiUsages.aiMessageId,
        provider: schema.aiUsages.provider,
        model: schema.aiUsages.model,
        promptTokens: schema.aiUsages.promptTokens,
        completionTokens: schema.aiUsages.completionTokens,
        totalTokens: schema.aiUsages.totalTokens,
        costUsd: schema.aiUsages.costUsd,
        createdAt: schema.aiUsages.createdAt,
        updatedAt: schema.aiUsages.updatedAt,
      })
      .from(schema.aiUsages)
      .innerJoin(schema.agentRuns, eq(schema.aiUsages.agentRunId, schema.agentRuns.id))
      .where(
        and(
          eq(schema.aiUsages.organizationId, organizationId),
          eq(schema.agentRuns.requestedByUserId, userId),
          gt(schema.aiUsages.createdAt, since),
        ),
      )
      .orderBy(desc(schema.aiUsages.createdAt), desc(schema.aiUsages.id))
      .limit(limit);
  }
}
