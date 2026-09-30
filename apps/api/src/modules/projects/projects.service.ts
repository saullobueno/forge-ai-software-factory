import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { CreateProjectRequest, PaginationRequest, UpdateProjectRequest } from '@forge/types';
import { readProtectedProjectSlugs } from '../../infrastructure/config/env.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { ProjectsRepository, type Page, type ProjectRow } from './projects.repository.js';

const MAX_SLUG_LENGTH = 60;

export type ProjectView = ProjectRow & { isProtected: boolean };

export const PROTECTED_PROJECT_MESSAGE =
  'Este é o projeto de demonstração e não pode ser editado nem excluído.';

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
  async findById(projectId: string, organizationId: string): Promise<ProjectView | undefined> {
    const project = await this.projectsRepository.findById(projectId, organizationId);
    return project ? this.toView(project) : undefined;
  }

  async listByOrganization(organizationId: string, pagination: PaginationRequest): Promise<Page<ProjectView>> {
    const page = await this.projectsRepository.listByOrganization(organizationId, pagination);
    return { ...page, items: page.items.map((project) => this.toView(project)) };
  }

  private toView(project: ProjectRow): ProjectView {
    return { ...project, isProtected: readProtectedProjectSlugs().has(project.slug) };
  }

  async create(organizationId: string, actorUserId: string, input: CreateProjectRequest): Promise<ProjectView> {
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

    return this.toView(project);
  }

  /** `undefined` quando o projeto não existe no tenant (o controller responde 404 genérico). */
  async update(
    projectId: string,
    organizationId: string,
    actorUserId: string,
    input: UpdateProjectRequest,
  ): Promise<ProjectView | undefined> {
    const current = await this.projectsRepository.findById(projectId, organizationId);
    if (!current) return undefined;
    if (this.toView(current).isProtected) throw new ForbiddenException(PROTECTED_PROJECT_MESSAGE);

    const techProfileChanged =
      input.languages !== undefined || input.frameworks !== undefined || input.packageManager !== undefined;

    const updated = await this.projectsRepository.update(projectId, organizationId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.architectureNotes !== undefined ? { architectureNotes: input.architectureNotes } : {}),
      ...(input.codeRules !== undefined ? { codeRules: input.codeRules } : {}),
      ...(techProfileChanged
        ? {
            techProfile: {
              languages: input.languages ?? current.techProfile.languages,
              frameworks: input.frameworks ?? current.techProfile.frameworks,
              packageManager:
                input.packageManager !== undefined ? input.packageManager : current.techProfile.packageManager,
            },
          }
        : {}),
    });
    if (!updated) return undefined;

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'project.updated',
      targetType: 'project',
      targetId: projectId,
      metadata: { changedFields: Object.keys(input) },
    });

    return this.toView(updated);
  }

  /**
   * `false` quando o projeto não existe no tenant. Bloqueia (409) enquanto
   * houver execução de IA em andamento sobre alguma tarefa do projeto: o
   * worker ainda escreveria steps para linhas que deixariam de existir.
   */
  async remove(projectId: string, organizationId: string, actorUserId: string): Promise<boolean> {
    const current = await this.projectsRepository.findById(projectId, organizationId);
    if (!current) return false;
    if (this.toView(current).isProtected) throw new ForbiddenException(PROTECTED_PROJECT_MESSAGE);

    if ((await this.projectsRepository.countActiveAgentRuns(projectId, organizationId)) > 0) {
      throw new ConflictException(
        'Há execuções de IA em andamento neste projeto. Aguarde a conclusão ou cancele-as antes de excluir.',
      );
    }

    const deleted = await this.projectsRepository.deleteWithDependents(projectId, organizationId);
    if (!deleted) return false;

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'project.deleted',
      targetType: 'project',
      targetId: projectId,
      metadata: { name: current.name, slug: current.slug },
    });

    return true;
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
