import { Injectable, NotFoundException } from '@nestjs/common';
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
}
