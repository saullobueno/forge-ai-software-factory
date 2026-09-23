import { eq } from 'drizzle-orm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../client.ts';
import {
  agentRuns,
  agentSteps,
  agents,
  approvals,
  auditLogs,
  organizations,
  projects,
  tasks,
  users,
} from './index.ts';

/**
 * Teste de integração real (spec §22): sobe um Postgres real embarcado
 * (PGlite) num diretório temporário isolado, aplica as migrações geradas
 * por `db:generate` e insere/consulta linhas respeitando as foreign keys.
 * Nada aqui é mockado — se o schema ou as migrações estiverem quebrados,
 * este teste falha de verdade.
 *
 * `DATABASE_LOCAL_PATH` precisa ser definido ANTES do primeiro import de
 * `../client` (que lê o env uma única vez no carregamento do módulo), por
 * isso o import é dinâmico dentro de `beforeAll`.
 */
let db: Database;
let closeDatabase: () => Promise<void>;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'forge-db-integration-'));
  process.env['DATABASE_LOCAL_PATH'] = join(dataDir, 'forge-test.pglite');

  const { createDatabase } = await import('../client');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const created = createDatabase();
  db = created.db;
  closeDatabase = created.close;

  await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: './drizzle' });
});

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env['DATABASE_LOCAL_PATH'];
});

describe('schema (PGlite + migrações reais)', () => {
  it('insere e consulta a cadeia Organization -> Project -> Task -> AgentRun -> AgentStep respeitando as FKs', async () => {
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Acme Platform', slug: 'acme-platform-chain-test' })
      .returning();
    if (!organization) throw new Error('organization não inserida');

    const [user] = await db
      .insert(users)
      .values({
        organizationId: organization.id,
        email: 'dev@acme-chain-test.example',
        name: 'Dev Acme',
        role: 'developer',
      })
      .returning();
    if (!user) throw new Error('user não inserido');

    const [project] = await db
      .insert(projects)
      .values({
        organizationId: organization.id,
        name: 'Forge Web',
        slug: 'forge-web-chain-test',
        techProfile: { languages: ['typescript'], frameworks: ['next.js'], packageManager: 'pnpm' },
      })
      .returning();
    if (!project) throw new Error('project não inserido');

    const [task] = await db
      .insert(tasks)
      .values({
        organizationId: organization.id,
        projectId: project.id,
        title: 'Implementar login',
        assigneeId: user.id,
      })
      .returning();
    if (!task) throw new Error('task não inserida');

    const [agent] = await db
      .insert(agents)
      .values({ organizationId: organization.id, role: 'implementer', name: 'Implementer' })
      .returning();
    if (!agent) throw new Error('agent não inserido');

    const [agentRun] = await db
      .insert(agentRuns)
      .values({
        organizationId: organization.id,
        taskId: task.id,
        agentId: agent.id,
        objective: 'Implementar endpoint de login',
      })
      .returning();
    if (!agentRun) throw new Error('agentRun não inserido');

    const [agentStep] = await db
      .insert(agentSteps)
      .values({ agentRunId: agentRun.id, name: 'Planejar', role: 'planner' })
      .returning();
    if (!agentStep) throw new Error('agentStep não inserido');

    // Consulta usando a API relacional do Drizzle, exercitando o grafo
    // completo definido em relations.ts.
    const found = await db.query.agentSteps.findFirst({
      where: eq(agentSteps.id, agentStep.id),
      with: {
        agentRun: {
          with: {
            task: {
              with: {
                project: {
                  with: { organization: true },
                },
                assignee: true,
              },
            },
          },
        },
      },
    });

    expect(found).toBeDefined();
    expect(found?.name).toBe('Planejar');
    expect(found?.status).toBe('pending');
    expect(found?.agentRun.objective).toBe('Implementar endpoint de login');
    expect(found?.agentRun.status).toBe('queued');
    expect(found?.agentRun.task.title).toBe('Implementar login');
    expect(found?.agentRun.task.assignee?.email).toBe('dev@acme-chain-test.example');
    expect(found?.agentRun.task.project.name).toBe('Forge Web');
    expect(found?.agentRun.task.project.organization.slug).toBe('acme-platform-chain-test');
  });

  it('rejeita um AgentRun apontando para uma Task inexistente (FK real, não simulada)', async () => {
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Acme FK Test', slug: 'acme-fk-test' })
      .returning();
    if (!organization) throw new Error('organization não inserida');

    const [agent] = await db
      .insert(agents)
      .values({ organizationId: organization.id, role: 'implementer', name: 'Implementer' })
      .returning();
    if (!agent) throw new Error('agent não inserido');

    await expect(
      db.insert(agentRuns).values({
        organizationId: organization.id,
        taskId: '00000000-0000-0000-0000-000000000000',
        agentId: agent.id,
        objective: 'Objetivo inválido',
      }),
    ).rejects.toThrow();
  });

  it('insere e consulta Approval e AuditLog (governança — spec §18, §20)', async () => {
    const [organization] = await db
      .insert(organizations)
      .values({ name: 'Acme Governance', slug: 'acme-governance-test' })
      .returning();
    if (!organization) throw new Error('organization não inserida');

    const [user] = await db
      .insert(users)
      .values({
        organizationId: organization.id,
        email: 'platform@acme-governance-test.example',
        name: 'Platform Engineer',
        role: 'platform_engineer',
      })
      .returning();
    if (!user) throw new Error('user não inserido');

    const subjectId = '11111111-1111-1111-1111-111111111111';

    const [approval] = await db
      .insert(approvals)
      .values({
        organizationId: organization.id,
        subjectType: 'deployment',
        subjectId,
        requestedByUserId: user.id,
      })
      .returning();
    expect(approval?.status).toBe('pending');
    expect(approval?.decidedAt).toBeNull();

    const [audit] = await db
      .insert(auditLogs)
      .values({
        organizationId: organization.id,
        actorType: 'user',
        actorUserId: user.id,
        action: 'approval.requested',
        targetType: 'deployment',
        targetId: subjectId,
        metadata: { reason: 'deploy para produção' },
      })
      .returning();

    expect(audit?.action).toBe('approval.requested');
    expect(audit?.metadata).toEqual({ reason: 'deploy para produção' });

    const auditRows = await db.query.auditLogs.findMany({
      where: eq(auditLogs.organizationId, organization.id),
    });
    expect(auditRows).toHaveLength(1);
  });
});
