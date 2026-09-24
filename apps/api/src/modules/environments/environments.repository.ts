import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type EnvironmentRow = typeof schema.environments.$inferSelect;
export type DeploymentRow = typeof schema.deployments.$inferSelect;
export type ApprovalRow = typeof schema.approvals.$inferSelect;

export interface DeploymentSummary extends DeploymentRow {
  deployedByUser: { id: string; name: string; email: string } | null;
  pullRequest: { id: string; externalNumber: number | null; title: string; externalUrl: string | null } | null;
  latestApproval: Pick<
    ApprovalRow,
    'id' | 'status' | 'requestedByUserId' | 'approvedByUserId' | 'reason' | 'decidedAt' | 'createdAt'
  > | null;
}

export interface EnvironmentWithDeployments extends EnvironmentRow {
  deployments: DeploymentSummary[];
}

/**
 * Fase 11 — ambientes. Mesmo padrão de isolamento de tenant das demais
 * camadas: `organizationId` sempre entra no `WHERE`. Deployments recentes
 * são montados manualmente para selecionar só campos seguros do usuário
 * (`users.passwordHash` nunca atravessa a fronteira HTTP).
 */
@Injectable()
export class EnvironmentsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listByProject(projectId: string, organizationId: string): Promise<EnvironmentWithDeployments[]> {
    const environments = await this.database.db.query.environments.findMany({
      where: and(eq(schema.environments.projectId, projectId), eq(schema.environments.organizationId, organizationId)),
      orderBy: [asc(schema.environments.kind), desc(schema.environments.createdAt)],
    });

    const environmentIds = environments.map((environment) => environment.id);
    if (environmentIds.length === 0) return [];

    const deploymentRows = await this.database.db
      .select({
        deployment: schema.deployments,
        deployedByUser: {
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
        },
        pullRequest: {
          id: schema.pullRequests.id,
          externalNumber: schema.pullRequests.externalNumber,
          title: schema.pullRequests.title,
          externalUrl: schema.pullRequests.externalUrl,
        },
      })
      .from(schema.deployments)
      .leftJoin(schema.users, eq(schema.deployments.deployedByUserId, schema.users.id))
      .leftJoin(schema.pullRequests, eq(schema.deployments.pullRequestId, schema.pullRequests.id))
      .where(
        and(
          eq(schema.deployments.organizationId, organizationId),
          eq(schema.deployments.projectId, projectId),
          inArray(schema.deployments.environmentId, environmentIds),
        ),
      )
      .orderBy(desc(schema.deployments.createdAt), desc(schema.deployments.id));

    const deploymentIds = deploymentRows.map((row) => row.deployment.id);
    const approvalRows =
      deploymentIds.length > 0
        ? await this.database.db.query.approvals.findMany({
            where: and(
              eq(schema.approvals.organizationId, organizationId),
              eq(schema.approvals.subjectType, 'deployment'),
              inArray(schema.approvals.subjectId, deploymentIds),
            ),
            orderBy: [desc(schema.approvals.createdAt), desc(schema.approvals.id)],
          })
        : [];

    const latestApprovalByDeployment = new Map<string, ApprovalRow>();
    for (const approval of approvalRows) {
      if (!latestApprovalByDeployment.has(approval.subjectId)) {
        latestApprovalByDeployment.set(approval.subjectId, approval);
      }
    }

    const deploymentsByEnvironment = new Map<string, DeploymentSummary[]>();
    for (const row of deploymentRows) {
      const current = deploymentsByEnvironment.get(row.deployment.environmentId) ?? [];
      if (current.length >= 3) continue;
      const latestApproval = latestApprovalByDeployment.get(row.deployment.id) ?? null;
      current.push({
        ...row.deployment,
        deployedByUser: row.deployedByUser?.id ? row.deployedByUser : null,
        pullRequest: row.pullRequest?.id ? row.pullRequest : null,
        latestApproval: latestApproval
          ? {
              id: latestApproval.id,
              status: latestApproval.status,
              requestedByUserId: latestApproval.requestedByUserId,
              approvedByUserId: latestApproval.approvedByUserId,
              reason: latestApproval.reason,
              decidedAt: latestApproval.decidedAt,
              createdAt: latestApproval.createdAt,
            }
          : null,
      });
      deploymentsByEnvironment.set(row.deployment.environmentId, current);
    }

    return environments.map((environment) => ({
      ...environment,
      deployments: deploymentsByEnvironment.get(environment.id) ?? [],
    }));
  }

  async findEnvironmentById(
    projectId: string,
    environmentId: string,
    organizationId: string,
  ): Promise<EnvironmentRow | undefined> {
    return this.database.db.query.environments.findFirst({
      where: and(
        eq(schema.environments.id, environmentId),
        eq(schema.environments.projectId, projectId),
        eq(schema.environments.organizationId, organizationId),
      ),
    });
  }

  async findPullRequestById(
    projectId: string,
    pullRequestId: string,
    organizationId: string,
  ): Promise<{ id: string; externalNumber: number | null; title: string; externalUrl: string | null } | undefined> {
    return this.database.db.query.pullRequests.findFirst({
      columns: {
        id: true,
        externalNumber: true,
        title: true,
        externalUrl: true,
      },
      where: and(
        eq(schema.pullRequests.id, pullRequestId),
        eq(schema.pullRequests.projectId, projectId),
        eq(schema.pullRequests.organizationId, organizationId),
      ),
    });
  }

  async findLatestDeployment(
    projectId: string,
    environmentId: string,
    organizationId: string,
  ): Promise<DeploymentRow | undefined> {
    return this.database.db.query.deployments.findFirst({
      where: and(
        eq(schema.deployments.projectId, projectId),
        eq(schema.deployments.environmentId, environmentId),
        eq(schema.deployments.organizationId, organizationId),
      ),
      orderBy: [desc(schema.deployments.createdAt), desc(schema.deployments.id)],
    });
  }

  async createDeployment(input: {
    organizationId: string;
    projectId: string;
    environmentId: string;
    pullRequestId: string | null;
    commitSha: string;
    status: 'queued' | 'succeeded';
    deployedByUserId: string;
    startedAt: Date | null;
    completedAt: Date | null;
  }): Promise<DeploymentRow> {
    const [created] = await this.database.db
      .insert(schema.deployments)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        pullRequestId: input.pullRequestId,
        commitSha: input.commitSha,
        status: input.status,
        deployedByUserId: input.deployedByUserId,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
      })
      .returning();
    if (!created) throw new Error('Falha ao criar deployment.');
    return created;
  }

  async createPendingDeploymentApproval(input: {
    organizationId: string;
    deploymentId: string;
    requestedByUserId: string;
    reason: string;
  }): Promise<ApprovalRow> {
    const [created] = await this.database.db
      .insert(schema.approvals)
      .values({
        organizationId: input.organizationId,
        subjectType: 'deployment',
        subjectId: input.deploymentId,
        status: 'pending',
        requestedByUserId: input.requestedByUserId,
        reason: input.reason,
      })
      .returning();
    if (!created) throw new Error('Falha ao criar approval de deployment.');
    return created;
  }

  /**
   * Deployment de um projeto/ambiente específicos, escopado por
   * `organizationId` (mesmo padrão de 404 genérico cross-tenant de
   * `findEnvironmentById`). `environmentId` também entra no filtro: a rota
   * é aninhada (`/projects/:projectId/environments/:environmentId/deployments/:deploymentId`),
   * então um `deploymentId` válido mas de OUTRO ambiente do mesmo projeto
   * não deveria "vazar" como encontrado.
   */
  async findDeploymentById(
    projectId: string,
    environmentId: string,
    deploymentId: string,
    organizationId: string,
  ): Promise<DeploymentRow | undefined> {
    return this.database.db.query.deployments.findFirst({
      where: and(
        eq(schema.deployments.id, deploymentId),
        eq(schema.deployments.projectId, projectId),
        eq(schema.deployments.environmentId, environmentId),
        eq(schema.deployments.organizationId, organizationId),
      ),
    });
  }

  /**
   * A `approval` `pending` mais recente para este deployment (spec §13 —
   * decisão sobre o gate). Normalmente há no máximo uma (criada uma vez por
   * `createPendingDeploymentApproval` no momento do pedido), mas
   * `findFirst`/`orderBy desc` garante que uma decisão sempre resolve a mais
   * recente caso o dado histórico tenha mais de uma por algum motivo.
   */
  async findPendingApprovalForDeployment(deploymentId: string, organizationId: string): Promise<ApprovalRow | undefined> {
    return this.database.db.query.approvals.findFirst({
      where: and(
        eq(schema.approvals.organizationId, organizationId),
        eq(schema.approvals.subjectType, 'deployment'),
        eq(schema.approvals.subjectId, deploymentId),
        eq(schema.approvals.status, 'pending'),
      ),
      orderBy: [desc(schema.approvals.createdAt), desc(schema.approvals.id)],
    });
  }

  async updateDeploymentStatus(
    deploymentId: string,
    organizationId: string,
    input: { status: 'succeeded' | 'failed'; startedAt: Date; completedAt: Date },
  ): Promise<DeploymentRow> {
    const [updated] = await this.database.db
      .update(schema.deployments)
      .set({ status: input.status, startedAt: input.startedAt, completedAt: input.completedAt, updatedAt: new Date() })
      .where(and(eq(schema.deployments.id, deploymentId), eq(schema.deployments.organizationId, organizationId)))
      .returning();
    if (!updated) throw new Error('Falha ao atualizar status do deployment.');
    return updated;
  }

  /**
   * Decide a `approval` pendente já existente (UPDATE na mesma linha, não
   * INSERT de uma nova) — diferente do padrão de `agent_run`
   * (`AgentRunApprovalsRepository.create`), que insere uma linha já decidida
   * porque não existe hoje um registro `pending` prévio naquele fluxo. Aqui
   * existe: `createPendingDeploymentApproval` já grava a linha `pending` no
   * momento do pedido, então decidir é literalmente resolver essa mesma
   * linha. `reason`: se quem decide informar um motivo, ele substitui o
   * motivo original (a justificativa do pedido); se não informar, o motivo
   * original é preservado — o campo é único na tabela, não há coluna
   * separada para "motivo do pedido" vs. "motivo da decisão".
   */
  async decideDeploymentApproval(
    approvalId: string,
    organizationId: string,
    input: { status: 'approved' | 'rejected'; approvedByUserId: string; reason: string | null },
  ): Promise<ApprovalRow> {
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
    if (!updated) throw new Error('Falha ao decidir approval de deployment.');
    return updated;
  }
}
