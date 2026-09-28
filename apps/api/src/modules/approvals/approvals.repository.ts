import { Injectable } from '@nestjs/common';
import { and, desc, eq, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export interface PendingAgentRunApproval {
  id: string;
  subjectType: 'agent_run';
  createdAt: Date;
  requestedByUserId: string | null;
  reason: string | null;
  agentRunId: string;
  agentRunObjective: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
}

export interface PendingDeploymentApproval {
  id: string;
  subjectType: 'deployment';
  createdAt: Date;
  requestedByUserId: string | null;
  reason: string | null;
  deploymentId: string;
  environmentId: string;
  environmentName: string;
  projectId: string;
  projectName: string;
}

export type PendingApproval = PendingAgentRunApproval | PendingDeploymentApproval;

/**
 * Camada de acesso a dados para o painel cross-execução de aprovações
 * pendentes (Fase 17 continuação #2, `GET /approvals/pending`). Só leitura
 * — a decisão em si continua nos módulos que já a possuem
 * (`AgentRunsService.approve`/`.reject`, `EnvironmentsService`
 * approve/reject de deployment); este repositório nunca escreve em
 * `approvals`.
 *
 * `approvals.subjectId` é uma referência polimórfica sem FK de banco (ver
 * o comentário do schema em `packages/database/src/schema/approvals.ts`),
 * então o join com `agentRuns`/`deployments` é feito na aplicação
 * (`eq(approvals.subjectId, agentRuns.id)`), não por uma relation Drizzle
 * declarada. Duas consultas separadas (uma por `subjectType`) em vez de uma
 * só com `UNION`/`CASE`: as colunas de navegação são completamente
 * diferentes entre os dois tipos (tarefa vs. ambiente), então tentar
 * unificar em uma única query só complicaria a leitura sem ganho real.
 */
@Injectable()
export class ApprovalsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listPendingAgentRunApprovals(organizationId: string): Promise<PendingAgentRunApproval[]> {
    const rows = await this.database.db
      .select({
        id: schema.approvals.id,
        createdAt: schema.approvals.createdAt,
        requestedByUserId: schema.approvals.requestedByUserId,
        reason: schema.approvals.reason,
        agentRunId: schema.agentRuns.id,
        agentRunObjective: schema.agentRuns.objective,
        taskId: schema.tasks.id,
        taskTitle: schema.tasks.title,
        projectId: schema.projects.id,
        projectName: schema.projects.name,
      })
      .from(schema.approvals)
      .innerJoin(schema.agentRuns, eq(schema.approvals.subjectId, schema.agentRuns.id))
      .innerJoin(schema.tasks, eq(schema.agentRuns.taskId, schema.tasks.id))
      .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .where(
        and(
          eq(schema.approvals.organizationId, organizationId),
          eq(schema.approvals.subjectType, 'agent_run'),
          eq(schema.approvals.status, 'pending'),
        ),
      )
      .orderBy(desc(schema.approvals.createdAt), desc(schema.approvals.id));

    return rows.map((row) => ({ ...row, subjectType: 'agent_run' as const }));
  }

  async listPendingDeploymentApprovals(organizationId: string): Promise<PendingDeploymentApproval[]> {
    const rows = await this.database.db
      .select({
        id: schema.approvals.id,
        createdAt: schema.approvals.createdAt,
        requestedByUserId: schema.approvals.requestedByUserId,
        reason: schema.approvals.reason,
        deploymentId: schema.deployments.id,
        environmentId: schema.environments.id,
        environmentName: schema.environments.name,
        projectId: schema.projects.id,
        projectName: schema.projects.name,
      })
      .from(schema.approvals)
      .innerJoin(schema.deployments, eq(schema.approvals.subjectId, schema.deployments.id))
      .innerJoin(schema.environments, eq(schema.deployments.environmentId, schema.environments.id))
      .innerJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
      .where(
        and(
          eq(schema.approvals.organizationId, organizationId),
          eq(schema.approvals.subjectType, 'deployment'),
          eq(schema.approvals.status, 'pending'),
        ),
      )
      .orderBy(desc(schema.approvals.createdAt), desc(schema.approvals.id));

    return rows.map((row) => ({ ...row, subjectType: 'deployment' as const }));
  }
}
