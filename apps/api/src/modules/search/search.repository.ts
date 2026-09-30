import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, or, schema } from '@forge/database';
import type { AgentRunStatus, TaskStatus } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export interface SearchProjectHit {
  id: string;
  name: string;
  slug: string;
}

export interface SearchTaskHit {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string;
  projectName: string;
}

export interface SearchRunHit {
  id: string;
  objective: string;
  status: AgentRunStatus;
  taskId: string;
  projectId: string;
  projectName: string;
}

const LIMITS = { projects: 5, tasks: 8, runs: 5 } as const;

/** `%` e `_` do texto digitado são literais, não curingas do LIKE. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, '\\$&')}%`;
}

/** Busca simples por substring (ILIKE), sempre escopada pela organização. */
@Injectable()
export class SearchRepository {
  constructor(private readonly database: DatabaseService) {}

  async projects(organizationId: string, q: string): Promise<SearchProjectHit[]> {
    const pattern = likePattern(q);
    return this.database.db
      .select({ id: schema.projects.id, name: schema.projects.name, slug: schema.projects.slug })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          or(ilike(schema.projects.name, pattern), ilike(schema.projects.slug, pattern), ilike(schema.projects.description, pattern)),
        ),
      )
      .orderBy(schema.projects.name)
      .limit(LIMITS.projects);
  }

  async tasks(organizationId: string, q: string): Promise<SearchTaskHit[]> {
    return this.database.db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        status: schema.tasks.status,
        projectId: schema.tasks.projectId,
        projectName: schema.projects.name,
      })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
      .where(and(eq(schema.tasks.organizationId, organizationId), ilike(schema.tasks.title, likePattern(q))))
      .orderBy(desc(schema.tasks.updatedAt))
      .limit(LIMITS.tasks);
  }

  async runs(organizationId: string, q: string): Promise<SearchRunHit[]> {
    return this.database.db
      .select({
        id: schema.agentRuns.id,
        objective: schema.agentRuns.objective,
        status: schema.agentRuns.status,
        taskId: schema.agentRuns.taskId,
        projectId: schema.projects.id,
        projectName: schema.projects.name,
      })
      .from(schema.agentRuns)
      .innerJoin(schema.tasks, eq(schema.tasks.id, schema.agentRuns.taskId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
      .where(and(eq(schema.agentRuns.organizationId, organizationId), ilike(schema.agentRuns.objective, likePattern(q))))
      .orderBy(desc(schema.agentRuns.createdAt))
      .limit(LIMITS.runs);
  }
}
