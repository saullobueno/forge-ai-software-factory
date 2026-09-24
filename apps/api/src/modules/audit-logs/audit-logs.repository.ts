import { Injectable } from '@nestjs/common';
import { and, desc, eq, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type AuditLogRow = typeof schema.auditLogs.$inferSelect;
export type NewAuditLog = typeof schema.auditLogs.$inferInsert;

export type AuditLogWithActor = AuditLogRow & {
  actorUser: { id: string; name: string; email: string; role: string } | null;
};

@Injectable()
export class AuditLogsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listByOrganization(organizationId: string): Promise<AuditLogWithActor[]> {
    return this.database.db.query.auditLogs.findMany({
      where: eq(schema.auditLogs.organizationId, organizationId),
      orderBy: [desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id)],
      limit: 50,
      with: {
        actorUser: {
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async create(input: NewAuditLog): Promise<AuditLogRow> {
    const [created] = await this.database.db.insert(schema.auditLogs).values(input).returning();
    if (!created) throw new Error('Audit log não foi criado.');
    return created;
  }

  /**
   * Acha o autor do audit log mais recente para uma `action`/`targetType`/
   * `targetId` específicos, dentro de uma organização — usado por
   * `AgentRunsService.approve`/`.reject` para recuperar quem originalmente
   * disparou a execução (`agent_run.triggered`) e preencher
   * `approvals.requestedByUserId`. Não existe hoje uma coluna
   * "triggeredByUserId" em `agentRuns` (Fase 4 não a modelou); o audit log
   * já escrito por `AgentRunsService.triggerForTask` é o único registro
   * dessa informação, então essa é a forma "razoável" de recuperá-la — se
   * por algum motivo não existir (ex.: execução seedada manualmente, sem
   * ter passado por `POST /tasks/:id/agent-runs`), retorna `null` em vez de
   * inventar um ator.
   */
  async findLatestActorForTarget(
    organizationId: string,
    targetType: string,
    targetId: string,
    action: string,
  ): Promise<string | null> {
    const row = await this.database.db.query.auditLogs.findFirst({
      where: and(
        eq(schema.auditLogs.organizationId, organizationId),
        eq(schema.auditLogs.targetType, targetType),
        eq(schema.auditLogs.targetId, targetId),
        eq(schema.auditLogs.action, action),
      ),
      orderBy: [desc(schema.auditLogs.createdAt)],
      columns: { actorUserId: true },
    });
    return row?.actorUserId ?? null;
  }
}
