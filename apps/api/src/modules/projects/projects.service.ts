import { Injectable } from '@nestjs/common';
import { ProjectsRepository, type ProjectRow } from './projects.repository.js';

@Injectable()
export class ProjectsService {
  constructor(private readonly projectsRepository: ProjectsRepository) {}

  /**
   * Retorna `undefined` tanto quando o projeto não existe quanto quando
   * existe em outra organização — de propósito: o controller responde 404
   * genérico nos dois casos, para não vazar a existência de um recurso de
   * outro tenant.
   */
  async findById(projectId: string, organizationId: string): Promise<ProjectRow | undefined> {
    return this.projectsRepository.findById(projectId, organizationId);
  }
}
