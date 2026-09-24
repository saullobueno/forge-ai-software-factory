import { Injectable, NotFoundException } from '@nestjs/common';
import type { EnvironmentWithDeployments } from './environments.repository.js';
import { EnvironmentsRepository } from './environments.repository.js';
import { ProjectsService } from '../projects/projects.service.js';

@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly environmentsRepository: EnvironmentsRepository,
    private readonly projectsService: ProjectsService,
  ) {}

  async listByProject(projectId: string, organizationId: string): Promise<EnvironmentWithDeployments[]> {
    const project = await this.projectsService.findById(projectId, organizationId);
    if (!project) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    return this.environmentsRepository.listByProject(project.id, organizationId);
  }
}
