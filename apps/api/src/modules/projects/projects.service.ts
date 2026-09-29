import { Injectable } from '@nestjs/common';
import type { CreateProjectRequest, PaginationRequest } from '@forge/types';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { ProjectsRepository, type Page, type ProjectRow } from './projects.repository.js';

const MAX_SLUG_LENGTH = 60;

export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'projeto';
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Retorna `undefined` tanto quando o projeto não existe quanto quando
   * existe em outra organização — de propósito: o controller responde 404
   * genérico nos dois casos, para não vazar a existência de um recurso de
   * outro tenant.
   */
  async findById(projectId: string, organizationId: string): Promise<ProjectRow | undefined> {
    return this.projectsRepository.findById(projectId, organizationId);
  }

  async listByOrganization(organizationId: string, pagination: PaginationRequest): Promise<Page<ProjectRow>> {
    return this.projectsRepository.listByOrganization(organizationId, pagination);
  }

  async create(organizationId: string, actorUserId: string, input: CreateProjectRequest): Promise<ProjectRow> {
    const slug = await this.uniqueSlug(organizationId, slugify(input.name));

    const project = await this.projectsRepository.createWithDemoRepository({
      organizationId,
      name: input.name,
      slug,
      description: input.description ?? null,
      techProfile: {
        languages: input.languages,
        frameworks: input.frameworks,
        packageManager: input.packageManager ?? null,
      },
    });

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'project.created',
      targetType: 'project',
      targetId: project.id,
      metadata: { name: project.name, slug: project.slug },
    });

    return project;
  }

  private async uniqueSlug(organizationId: string, base: string): Promise<string> {
    const taken = new Set(await this.projectsRepository.findSlugsWithPrefix(organizationId, base));
    if (!taken.has(base)) return base;

    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${base}-${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
