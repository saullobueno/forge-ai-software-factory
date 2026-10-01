import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, eq, schema } from '@forge/database';
import { buildAgentRoleCatalog } from '@forge/database';
import type { AgentRole } from '@forge/types';
import { isProtectedUserEmail, readProtectedProjectSlugs } from '../../infrastructure/config/env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { ProjectsRepository } from '../projects/projects.repository.js';

export interface DemoResetSummary {
  projectsRemoved: number;
  projectsSkipped: number;
  membersRemoved: number;
  invitationsRemoved: number;
  datasetsRemoved: number;
  agentsRestored: number;
  policiesCleared: boolean;
  sessionsRevoked: number;
}

/**
 * "Resetar demo": devolve a organização de demonstração ao estado do seed — para quem visita a demo
 * pública e mexe em políticas/agentes/usuários/projetos. Só vale para a organização cujo admin é uma
 * conta de demonstração (`PROTECTED_USER_EMAIL_SUFFIXES`); uma organização real nunca é apagada por aqui.
 */
@Injectable()
export class DemoService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projectsRepository: ProjectsRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  isResettable(user: { email: string; role: string }): boolean {
    return user.role === 'admin' && isProtectedUserEmail(user.email);
  }

  async reset(
    actor: { id: string; email: string; role: string; organizationId: string },
    currentSessionId: string,
  ): Promise<DemoResetSummary> {
    if (!this.isResettable(actor)) throw new ForbiddenException('Só o administrador da organização de demonstração pode resetá-la.');
    const organizationId = actor.organizationId;
    const db = this.database.db;
    const protectedSlugs = readProtectedProjectSlugs();

    // projetos criados por visitantes (o protegido do seed fica); pula os com execução de IA em andamento
    const projects = await db.select().from(schema.projects).where(eq(schema.projects.organizationId, organizationId));
    let projectsRemoved = 0;
    let projectsSkipped = 0;
    for (const project of projects) {
      if (protectedSlugs.has(project.slug)) continue;
      if ((await this.projectsRepository.countActiveAgentRuns(project.id, organizationId)) > 0) {
        projectsSkipped += 1;
        continue;
      }
      if (await this.projectsRepository.deleteWithDependents(project.id, organizationId)) projectsRemoved += 1;
    }

    const members = await db.select().from(schema.users).where(eq(schema.users.organizationId, organizationId));
    let membersRemoved = 0;
    for (const member of members) {
      if (isProtectedUserEmail(member.email)) continue;
      await db.delete(schema.users).where(and(eq(schema.users.id, member.id), eq(schema.users.organizationId, organizationId)));
      membersRemoved += 1;
    }

    const invitations = await db.delete(schema.invitations).where(eq(schema.invitations.organizationId, organizationId)).returning();
    const datasets = await db
      .delete(schema.playgroundDatasets)
      .where(eq(schema.playgroundDatasets.organizationId, organizationId))
      .returning();
    const cleared = await db.delete(schema.policies).where(eq(schema.policies.organizationId, organizationId)).returning();

    const catalog = buildAgentRoleCatalog();
    let agentsRestored = 0;
    for (const [role, config] of Object.entries(catalog) as [AgentRole, (typeof catalog)[AgentRole]][]) {
      const restored = await db
        .update(schema.agents)
        .set({
          name: config.name,
          description: config.description,
          allowedTools: config.allowedTools,
          instructions: null,
          isEnabled: true,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.agents.organizationId, organizationId), eq(schema.agents.role, role)))
        .returning();
      agentsRestored += restored.length;
    }

    // sessões de outros visitantes saem; a de quem resetou continua
    const sessions = await db
      .update(schema.userSessions)
      .set({ revokedAt: new Date(), revokedReason: 'demo_reset' })
      .where(eq(schema.userSessions.organizationId, organizationId))
      .returning();
    const kept = sessions.find((session) => session.id === currentSessionId);
    if (kept) await db.update(schema.userSessions).set({ revokedAt: null, revokedReason: null }).where(eq(schema.userSessions.id, kept.id));

    const summary: DemoResetSummary = {
      projectsRemoved,
      projectsSkipped,
      membersRemoved,
      invitationsRemoved: invitations.length,
      datasetsRemoved: datasets.length,
      agentsRestored,
      policiesCleared: cleared.length > 0,
      sessionsRevoked: sessions.length - (kept ? 1 : 0),
    };
    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId: actor.id,
      action: 'demo.reset',
      targetType: 'organization',
      targetId: organizationId,
      metadata: { ...summary },
    });
    return summary;
  }
}
