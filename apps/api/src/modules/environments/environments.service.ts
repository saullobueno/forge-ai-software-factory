import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestDeployment } from '@forge/types';
import type { DeploymentSummary, EnvironmentWithDeployments } from './environments.repository.js';
import { EnvironmentsRepository } from './environments.repository.js';
import { ProjectsService } from '../projects/projects.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';

@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly environmentsRepository: EnvironmentsRepository,
    private readonly projectsService: ProjectsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async listByProject(projectId: string, organizationId: string): Promise<EnvironmentWithDeployments[]> {
    const project = await this.projectsService.findById(projectId, organizationId);
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    return this.environmentsRepository.listByProject(project.id, organizationId);
  }

  async requestDeployment(
    projectId: string,
    environmentId: string,
    organizationId: string,
    requestedByUserId: string,
    input: RequestDeployment,
  ): Promise<DeploymentSummary> {
    const project = await this.projectsService.findById(projectId, organizationId);
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    const environment = await this.environmentsRepository.findEnvironmentById(project.id, environmentId, organizationId);
    if (!environment) {
      throw new NotFoundException('Ambiente não encontrado.');
    }

    const pullRequestId = input.pullRequestId ?? null;
    const pullRequest = pullRequestId
      ? await this.environmentsRepository.findPullRequestById(project.id, pullRequestId, organizationId)
      : undefined;
    if (pullRequestId && !pullRequest) {
      throw new NotFoundException('Pull request não encontrado.');
    }

    const latestDeployment = await this.environmentsRepository.findLatestDeployment(
      project.id,
      environment.id,
      organizationId,
    );
    const commitSha = input.commitSha ?? latestDeployment?.commitSha ?? `demo-${Date.now().toString(16)}`;

    const now = new Date();
    const deployment = await this.environmentsRepository.createDeployment({
      organizationId,
      projectId: project.id,
      environmentId: environment.id,
      pullRequestId,
      commitSha,
      status: environment.isProtected ? 'queued' : 'succeeded',
      deployedByUserId: requestedByUserId,
      startedAt: environment.isProtected ? null : now,
      completedAt: environment.isProtected ? null : now,
    });

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId: requestedByUserId,
      action: 'deployment.requested',
      targetType: 'deployment',
      targetId: deployment.id,
      metadata: {
        projectId: project.id,
        environmentId: environment.id,
        environmentKind: environment.kind,
        protected: environment.isProtected,
        commitSha,
        pullRequestId,
      },
    });

    const approval = environment.isProtected
      ? await this.environmentsRepository.createPendingDeploymentApproval({
          organizationId,
          deploymentId: deployment.id,
          requestedByUserId,
          reason: `Deployment para ${environment.name} exige aprovação por ser um ambiente protegido.`,
        })
      : null;

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId: requestedByUserId,
      action: environment.isProtected ? 'deployment.approval_required' : 'deployment.succeeded',
      targetType: 'deployment',
      targetId: deployment.id,
      metadata: {
        projectId: project.id,
        environmentId: environment.id,
        environmentKind: environment.kind,
        commitSha,
        approvalId: approval?.id ?? null,
      },
    });

    return {
      ...deployment,
      deployedByUser: null,
      pullRequest: pullRequest ?? null,
      latestApproval: approval
        ? {
            id: approval.id,
            status: approval.status,
            requestedByUserId: approval.requestedByUserId,
            approvedByUserId: approval.approvedByUserId,
            reason: approval.reason,
            decidedAt: approval.decidedAt,
            createdAt: approval.createdAt,
          }
        : null,
    };
  }

  /**
   * Aprova um deployment parado em `queued` com uma `approval` `pending`
   * (spec §13 — "deploy para ambientes protegidos exige aprovação"). Mesmo
   * padrão de `AgentRunsService.approve`/`decide`: 409 se o deployment não
   * estiver no estado exato esperado, transição real de status, audit log.
   * `environment:approve_deployment` (guard no controller) é uma permissão
   * deliberadamente diferente de `environment:deploy` — ver comentário em
   * `packages/domain/src/permissions.ts`.
   *
   * "Aprovar" aqui simula sucesso imediato do deploy (mesma simulação
   * "demo" já usada em `requestDeployment` para ambientes não-protegidos) —
   * nenhuma chamada real a provedor externo, isso não muda nesta tarefa.
   */
  async approveDeployment(
    projectId: string,
    environmentId: string,
    deploymentId: string,
    organizationId: string,
    actorUserId: string,
    reason: string | null,
  ): Promise<DeploymentSummary> {
    return this.decideDeployment(projectId, environmentId, deploymentId, organizationId, actorUserId, 'approved', reason);
  }

  /**
   * Rejeita um deployment parado em `queued`. Diferente do fluxo de
   * `agent_run` (que tem `cancelled` como estado terminal concorrente e
   * decide deliberadamente não usá-lo para rejeição), `DeploymentStatus` não
   * tem um estado "cancelado" à parte — `failed` já é o estado terminal
   * natural para "este deployment não aconteceu", seja por erro técnico ou
   * por um humano ter rejeitado a promoção. A diferença entre os dois fica
   * registrada onde deveria: na linha de `approvals` (`status: 'rejected'`,
   * `approvedByUserId` preenchido) e no audit log (`deployment.rejected`),
   * não em mais um valor no enum de status.
   */
  async rejectDeployment(
    projectId: string,
    environmentId: string,
    deploymentId: string,
    organizationId: string,
    actorUserId: string,
    reason: string | null,
  ): Promise<DeploymentSummary> {
    return this.decideDeployment(projectId, environmentId, deploymentId, organizationId, actorUserId, 'rejected', reason);
  }

  private async decideDeployment(
    projectId: string,
    environmentId: string,
    deploymentId: string,
    organizationId: string,
    actorUserId: string,
    decision: 'approved' | 'rejected',
    reason: string | null,
  ): Promise<DeploymentSummary> {
    const project = await this.projectsService.findById(projectId, organizationId);
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    const environment = await this.environmentsRepository.findEnvironmentById(project.id, environmentId, organizationId);
    if (!environment) {
      throw new NotFoundException('Ambiente não encontrado.');
    }

    const deployment = await this.environmentsRepository.findDeploymentById(
      project.id,
      environment.id,
      deploymentId,
      organizationId,
    );
    if (!deployment) {
      throw new NotFoundException('Deployment não encontrado.');
    }

    if (deployment.status !== 'queued') {
      throw new ConflictException(
        `Não é possível ${decision === 'approved' ? 'aprovar' : 'rejeitar'} um deployment em status "${deployment.status}".`,
      );
    }

    const pendingApproval = await this.environmentsRepository.findPendingApprovalForDeployment(
      deployment.id,
      organizationId,
    );
    if (!pendingApproval) {
      throw new ConflictException('Este deployment não tem uma aprovação pendente.');
    }

    const now = new Date();
    const deploymentStatus = decision === 'approved' ? 'succeeded' : 'failed';

    const updatedDeployment = await this.environmentsRepository.updateDeploymentStatus(deployment.id, organizationId, {
      status: deploymentStatus,
      startedAt: now,
      completedAt: now,
    });

    const updatedApproval = await this.environmentsRepository.decideDeploymentApproval(pendingApproval.id, organizationId, {
      status: decision,
      approvedByUserId: actorUserId,
      reason: reason ?? pendingApproval.reason,
    });

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: decision === 'approved' ? 'deployment.approved' : 'deployment.rejected',
      targetType: 'deployment',
      targetId: deployment.id,
      metadata: {
        projectId: project.id,
        environmentId: environment.id,
        previousStatus: deployment.status,
        status: updatedDeployment.status,
        approvalId: updatedApproval.id,
        reason,
      },
    });

    const pullRequest = deployment.pullRequestId
      ? await this.environmentsRepository.findPullRequestById(project.id, deployment.pullRequestId, organizationId)
      : undefined;

    return {
      ...updatedDeployment,
      deployedByUser: null,
      pullRequest: pullRequest ?? null,
      latestApproval: {
        id: updatedApproval.id,
        status: updatedApproval.status,
        requestedByUserId: updatedApproval.requestedByUserId,
        approvedByUserId: updatedApproval.approvedByUserId,
        reason: updatedApproval.reason,
        decidedAt: updatedApproval.decidedAt,
        createdAt: updatedApproval.createdAt,
      },
    };
  }
}
