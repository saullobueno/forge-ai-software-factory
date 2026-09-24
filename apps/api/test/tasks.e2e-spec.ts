import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real contra banco real (PGlite + migrações aplicadas) para as rotas
 * de tarefas e disparo de execução de IA da Fase 4: `GET /projects/:id/tasks`,
 * `GET /tasks/:id` e `POST /tasks/:id/agent-runs`. Mesmo padrão de
 * `projects.e2e-spec.ts` — isolamento de tenant (404 genérico cross-tenant)
 * e RBAC (403 por permissão insuficiente).
 */
let testApp: TestApp;
let projectAId: string;
let taskA1Id: string;
let taskA2Id: string;
let taskBId: string;
let developerAId: string;
let developerAToken: string;
let qaEngineerAToken: string;
let productManagerAToken: string;
let developerBToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Tasks E2E', slug: 'org-a-tasks-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Tasks E2E', slug: 'org-b-tasks-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);

  const users = await testApp.db.insert(testApp.schema.users).values([
    {
      organizationId: organizationA.id,
      email: 'dev@org-a-tasks-e2e-test.example',
      name: 'Dev A',
      role: 'developer',
      passwordHash,
    },
    {
      organizationId: organizationA.id,
      email: 'qa@org-a-tasks-e2e-test.example',
      name: 'QA A',
      role: 'qa_engineer',
      passwordHash,
    },
    {
      organizationId: organizationA.id,
      email: 'pm@org-a-tasks-e2e-test.example',
      name: 'PM A',
      role: 'product_manager',
      passwordHash,
    },
    {
      organizationId: organizationB.id,
      email: 'dev@org-b-tasks-e2e-test.example',
      name: 'Dev B',
      role: 'developer',
      passwordHash,
    },
  ]).returning();
  const developerA = users.find((user) => user.email === 'dev@org-a-tasks-e2e-test.example');
  if (!developerA) throw new Error('developer A não inserido');
  developerAId = developerA.id;

  const [projectA] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project A', slug: 'project-a-tasks-e2e-test' })
    .returning();
  const [projectB] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationB.id, name: 'Project B', slug: 'project-b-tasks-e2e-test' })
    .returning();
  if (!projectA || !projectB) throw new Error('projects não inseridos');
  projectAId = projectA.id;

  const [taskA1] = await testApp.db
    .insert(testApp.schema.tasks)
    .values({
      organizationId: organizationA.id,
      projectId: projectA.id,
      title: 'Configurar CI',
      description: 'Adicionar pipeline de CI',
      priority: 'high',
      status: 'ready',
    })
    .returning();
  const [taskA2] = await testApp.db
    .insert(testApp.schema.tasks)
    .values({
      organizationId: organizationA.id,
      projectId: projectA.id,
      title: 'Publicar release',
      description: 'Depende do CI estar configurado',
      priority: 'medium',
      status: 'backlog',
    })
    .returning();
  const [taskB] = await testApp.db
    .insert(testApp.schema.tasks)
    .values({ organizationId: organizationB.id, projectId: projectB.id, title: 'Task de outra org' })
    .returning();
  if (!taskA1 || !taskA2 || !taskB) throw new Error('tasks não inseridas');
  taskA1Id = taskA1.id;
  taskA2Id = taskA2.id;
  taskBId = taskB.id;

  await testApp.db
    .insert(testApp.schema.taskDependencies)
    .values({ taskId: taskA2.id, dependsOnTaskId: taskA1.id });

  await testApp.db.insert(testApp.schema.agents).values({
    organizationId: organizationA.id,
    role: 'planner',
    name: 'Planner A',
    description: 'Agente planner de teste',
  });

  const [knowledgeSource] = await testApp.db
    .insert(testApp.schema.knowledgeSources)
    .values({
      organizationId: organizationA.id,
      projectId: projectA.id,
      kind: 'adr',
      title: 'ADR para configurar pipelines',
      uri: 'demo://tasks-e2e/adr-ci',
    })
    .returning();
  if (!knowledgeSource) throw new Error('knowledge source não inserida');

  await testApp.db.insert(testApp.schema.knowledgeChunks).values({
    knowledgeSourceId: knowledgeSource.id,
    chunkIndex: 0,
    content: 'Ao configurar pipelines, preservar isolamento por organizationId antes de executar automações.',
    tokenCount: 13,
  });

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  developerAToken = await login('dev@org-a-tasks-e2e-test.example');
  qaEngineerAToken = await login('qa@org-a-tasks-e2e-test.example');
  productManagerAToken = await login('pm@org-a-tasks-e2e-test.example');
  developerBToken = await login('dev@org-b-tasks-e2e-test.example');
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /projects/:id/tasks', () => {
  it('lista as tarefas do projeto (com dependências) para um usuário da própria organização', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/tasks`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    const task2 = response.body.find((task: { id: string }) => task.id === taskA2Id);
    expect(task2.dependencies).toHaveLength(1);
    expect(task2.dependencies[0].dependsOnTask.id).toBe(taskA1Id);
    expect(task2.dependencies[0].dependsOnTask.title).toBe('Configurar CI');
  });

  it('retorna 404 (não 403) para um projeto de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/tasks`)
      .set('Authorization', `Bearer ${developerBToken}`)
      .expect(404);
  });

  it('retorna 403 para um usuário da organização certa sem project:read', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/tasks`)
      .set('Authorization', `Bearer ${qaEngineerAToken}`)
      .expect(403);
  });
});

describe('GET /tasks/:id', () => {
  it('retorna a tarefa para um usuário da própria organização', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/tasks/${taskA1Id}`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body.id).toBe(taskA1Id);
    expect(response.body.title).toBe('Configurar CI');
  });

  it('retorna 404 para uma tarefa de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/tasks/${taskBId}`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 404 para um id que não existe em nenhuma organização', async () => {
    await request(testApp.app.getHttpServer())
      .get('/tasks/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });
});

describe('POST /tasks/:id/agent-runs', () => {
  it('cria um agentRun em status "queued" para um usuário com agent_run:trigger', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/tasks/${taskA1Id}/agent-runs`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(201);

    expect(response.body.taskId).toBe(taskA1Id);
    expect(response.body.status).toBe('queued');
    expect(response.body.startedAt).toBeNull();
    expect(response.body.completedAt).toBeNull();

    const { and, eq } = await import('@forge/database');
    const [auditLog] = await testApp.db.query.auditLogs.findMany({
      where: and(
        eq(testApp.schema.auditLogs.action, 'agent_run.triggered'),
        eq(testApp.schema.auditLogs.targetId, response.body.id as string),
      ),
      limit: 1,
    });
    expect(auditLog).toMatchObject({
      organizationId: expect.any(String),
      actorType: 'user',
      actorUserId: developerAId,
      action: 'agent_run.triggered',
      targetType: 'agent_run',
      targetId: response.body.id,
    });
    expect(auditLog?.metadata).toMatchObject({
      taskId: taskA1Id,
      status: 'queued',
    });
  });

  it('retorna 404 para uma tarefa de OUTRA organização', async () => {
    await request(testApp.app.getHttpServer())
      .post(`/tasks/${taskBId}/agent-runs`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 403 para um usuário sem agent_run:trigger', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post(`/tasks/${taskA1Id}/agent-runs`)
      .set('Authorization', `Bearer ${productManagerAToken}`)
      .expect(403);

    expect(response.body.message).toMatch(/permissão/i);
  });

  it('injeta conhecimento persistido do projeto no run processado pelo worker', async () => {
    const createResponse = await request(testApp.app.getHttpServer())
      .post(`/tasks/${taskA1Id}/agent-runs`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(201);

    const detail = await waitForAgentRunProcessed(createResponse.body.id as string);
    const plannerStep = detail.steps.find((step: { role: string }) => step.role === 'planner');

    expect(plannerStep?.input.knowledgeContext).toEqual([
      expect.objectContaining({
        title: 'ADR para configurar pipelines',
        wrappedContent: expect.stringContaining('<untrusted_knowledge>'),
      }),
    ]);
    expect(plannerStep?.output.knowledgeSourcesUsed).toEqual([
      expect.objectContaining({
        title: 'ADR para configurar pipelines',
        kind: 'adr',
      }),
    ]);

    const { eq } = await import('@forge/database');
    const usages = await testApp.db.query.aiUsages.findMany({
      where: eq(testApp.schema.aiUsages.agentRunId, createResponse.body.id as string),
    });
    expect(usages.length).toBeGreaterThan(0);
    expect(usages[0]).toMatchObject({
      provider: 'mock',
      model: 'mock-deterministic',
      totalTokens: expect.any(Number),
    });
  });
});

async function waitForAgentRunProcessed(agentRunId: string): Promise<{
  status: string;
  steps: Array<{ role: string; input: Record<string, unknown>; output: Record<string, unknown> }>;
}> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request(testApp.app.getHttpServer())
      .get(`/agent-runs/${agentRunId}`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    if (response.body.status !== 'queued' && response.body.steps.length > 0) {
      return response.body;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`agentRun ${agentRunId} não foi processado a tempo`);
}
