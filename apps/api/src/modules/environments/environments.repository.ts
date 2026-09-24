import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type EnvironmentRow = typeof schema.environments.$inferSelect;
export type DeploymentRow = typeof schema.deployments.$inferSelect;

export interface DeploymentSummary extends DeploymentRow {
  deployedByUser: { id: string; name: string; email: string } | null;
  pullRequest: { id: string; externalNumber: number | null; title: string; externalUrl: string | null } | null;
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

    const deploymentsByEnvironment = new Map<string, DeploymentSummary[]>();
    for (const row of deploymentRows) {
      const current = deploymentsByEnvironment.get(row.deployment.environmentId) ?? [];
      if (current.length >= 3) continue;
      current.push({
        ...row.deployment,
        deployedByUser: row.deployedByUser?.id ? row.deployedByUser : null,
        pullRequest: row.pullRequest?.id ? row.pullRequest : null,
      });
      deploymentsByEnvironment.set(row.deployment.environmentId, current);
    }

    return environments.map((environment) => ({
      ...environment,
      deployments: deploymentsByEnvironment.get(environment.id) ?? [],
    }));
  }
}
