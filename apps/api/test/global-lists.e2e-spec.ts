import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações, sem mocks) para as listas globais
 * (`GET /tasks`, `GET /agent-runs`) e para `POST /tasks/:id/status` (Kanban):
 * filtros, paginação por cursor, isolamento de tenant, RBAC, máquina de
 * estados e proteção do projeto de demonstração.
 */
let testApp: TestApp;
let orgAId: string;
let agentId: string;
let leadId: string;
let leadToken: string;
let devToken: string;
let qaToken: string;
let leadBToken: string;

const password = 'demo1234';
const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [orgA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Global Lists E2E', slug: 'org-a-global-lists-e2e-test' })
    .returning();
  const [orgB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Global Lists E2E', slug: 'org-b-global-lists-e2e-test' })
    .returning();
  if (!orgA || !orgB) throw new Error('organizations não inseridas');
  orgAId = orgA.id;

  const [agent] = await testApp.db
    .insert(testApp.schema.agents)
    .values({ organizationId: orgA.id, role: 'planner', name: 'Planner A', description: 'Agente de teste' })
    .returning();
  if (!agent) throw new Error('agent não inserido');
  agentId = agent.id;

  const passwordHash = await hashPassword(password);
  const users = await testApp.db
    .insert(testApp.schema.users)
    .values([
      { organizationId: orgA.id, email: 'lead@a-global.example', name: 'Lead A', role: 'tech_lead', passwordHash },
      { organizationId: orgA.id, email: 'dev@a-global.example', name: 'Dev A', role: 'developer', passwordHash },
      { organizationId: orgA.id, email: 'qa@a-global.example', name: 'QA A', role: 'qa_engineer', passwordHash },
      { organizationId: orgB.id, email: 'lead@b-global.example', name: 'Lead B', role: 'tech_lead', passwordHash },
    ])
    .returning();
  leadId = users.find((user) => user.email === 'lead@a-global.example')?.id ?? '';

  const login = async (email: string): Promise<string> => {
    const response = await http().post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  leadToken = await login('lead@a-global.example');
  devToken = await login('dev@a-global.example');
  qaToken = await login('qa@a-global.example');
  leadBToken = await login('lead@b-global.example');
});

afterAll(async () => {
  await testApp.cleanup();
});

async function newProject(token: string, name: string): Promise<string> {
  const response = await http().post('/projects').set(auth(token)).send({ name }).expect(201);
  return response.body.id as string;
}

async function newTask(token: string, projectId: string, body: Record<string, unknown>): Promise<string> {
  const response = await http().post(`/projects/${projectId}/tasks`).set(auth(token)).send(body).expect(201);
  return response.body.id as string;
}

describe('GET /tasks', () => {
  let projectAId: string;
  let projectA2Id: string;
  let alphaId: string;

  beforeAll(async () => {
    projectAId = await newProject(leadToken, 'Projeto Lista A');
    projectA2Id = await newProject(leadToken, 'Projeto Lista A2');
    alphaId = await newTask(devToken, projectAId, { title: 'Alpha migrar banco', priority: 'high' });
    await newTask(devToken, projectAId, { title: 'Beta ajustar layout', priority: 'low' });
    await newTask(devToken, projectA2Id, { title: 'Gamma migrar fila', priority: 'high' });
    const projectB = await newProject(leadBToken, 'Projeto Lista B');
    await newTask(leadBToken, projectB, { title: 'Delta de outra organização' });
  });

  it('lista só as tarefas da organização, com projeto, proteção e próximos status permitidos', async () => {
    const response = await http().get('/tasks').set(auth(leadToken)).expect(200);
    const titles = (response.body.items as { title: string }[]).map((task) => task.title);

    expect(titles).toEqual(expect.arrayContaining(['Alpha migrar banco', 'Beta ajustar layout', 'Gamma migrar fila']));
    expect(titles).not.toContain('Delta de outra organização');

    const alpha = (response.body.items as { id: string }[]).find((task) => task.id === alphaId);
    expect(alpha).toMatchObject({
      projectName: 'Projeto Lista A',
      projectSlug: 'projeto-lista-a',
      projectIsProtected: false,
      status: 'ready',
      allowedNextStatuses: ['planning', 'backlog', 'blocked'],
    });
  });

  it('filtra por projeto, prioridade, status e texto (sem tratar % e _ como curinga)', async () => {
    const byProject = await http().get('/tasks').query({ projectId: projectA2Id }).set(auth(leadToken)).expect(200);
    expect((byProject.body.items as { title: string }[]).map((task) => task.title)).toEqual(['Gamma migrar fila']);

    const byPriority = await http().get('/tasks').query({ priority: 'low' }).set(auth(leadToken)).expect(200);
    expect((byPriority.body.items as { title: string }[]).map((task) => task.title)).toEqual(['Beta ajustar layout']);

    const byStatus = await http().get('/tasks').query({ status: 'done' }).set(auth(leadToken)).expect(200);
    expect(byStatus.body.items).toEqual([]);

    const byText = await http().get('/tasks').query({ q: 'MIGRAR' }).set(auth(leadToken)).expect(200);
    expect((byText.body.items as { title: string }[]).map((task) => task.title).sort()).toEqual([
      'Alpha migrar banco',
      'Gamma migrar fila',
    ]);

    const wildcard = await http().get('/tasks').query({ q: '%' }).set(auth(leadToken)).expect(200);
    expect(wildcard.body.items).toEqual([]);
  });

  it('pagina por cursor sem repetir nem perder itens', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const response = await http()
        .get('/tasks')
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .set(auth(leadToken))
        .expect(200);
      for (const task of response.body.items as { id: string }[]) seen.push(task.id);
      cursor = (response.body.nextCursor as string | null) ?? undefined;
      if (!cursor) break;
    }
    const all = await http().get('/tasks').query({ limit: 200 }).set(auth(leadToken)).expect(200);
    expect(seen).toHaveLength((all.body.items as unknown[]).length);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('401 sem token e 400 para filtro inválido', async () => {
    await http().get('/tasks').expect(401);
    await http().get('/tasks').query({ status: 'inexistente' }).set(auth(leadToken)).expect(400);
    await http().get('/tasks').query({ limit: 500 }).set(auth(leadToken)).expect(400);
  });
});

describe('POST /tasks/:id/status', () => {
  let projectId: string;

  beforeAll(async () => {
    projectId = await newProject(leadToken, 'Projeto Kanban');
  });

  const move = (token: string, taskId: string, status: string) =>
    http().post(`/tasks/${taskId}/status`).set(auth(token)).send({ status });

  it('move pela máquina de estados e audita a mudança', async () => {
    const taskId = await newTask(devToken, projectId, { title: 'Tarefa do Kanban' });

    const moved = await move(devToken, taskId, 'planning').expect(200);
    expect(moved.body.status).toBe('planning');
    await move(devToken, taskId, 'in_progress').expect(200);

    const audit = await testApp.db.query.auditLogs.findMany({
      where: (table, { and, eq }) => and(eq(table.organizationId, orgAId), eq(table.action, 'task.status_changed')),
    });
    expect(audit.filter((entry) => entry.targetId === taskId)).toHaveLength(2);
  });

  it('409 para transição inválida, com a mensagem do domínio', async () => {
    const taskId = await newTask(devToken, projectId, { title: 'Transição inválida' });
    const response = await move(devToken, taskId, 'done').expect(409);
    expect(response.body.message).toContain('"ready" -> "done"');
    await move(devToken, taskId, 'ready').expect(409);
  });

  it('403 sem task:manage, 404 cross-tenant/id inválido e 400 para status inválido', async () => {
    const taskId = await newTask(devToken, projectId, { title: 'Permissões do Kanban' });
    await move(qaToken, taskId, 'planning').expect(403);
    await move(leadBToken, taskId, 'planning').expect(404);
    await move(leadToken, 'nao-e-uuid', 'planning').expect(404);
    await move(leadToken, taskId, 'inexistente').expect(400);
    await http().post(`/tasks/${taskId}/status`).send({ status: 'planning' }).expect(401);
  });

  it('403 no projeto de demonstração protegido', async () => {
    const demo = await http().post('/projects').set(auth(leadToken)).send({ name: 'Forge Web App' }).expect(201);
    const taskId = await newTask(devToken, demo.body.id as string, { title: 'Tarefa da demo' });
    await move(devToken, taskId, 'planning').expect(403);
  });
});

describe('GET /agent-runs', () => {
  let projectId: string;
  let otherProjectId: string;
  const runIds: string[] = [];

  beforeAll(async () => {
    projectId = await newProject(leadToken, 'Projeto Execuções');
    otherProjectId = await newProject(leadToken, 'Projeto Outras Execuções');
    const taskId = await newTask(devToken, projectId, { title: 'Tarefa com execuções' });
    const otherTaskId = await newTask(devToken, otherProjectId, { title: 'Tarefa de outro projeto' });

    const statuses = ['completed', 'failed', 'approval_required'] as const;
    for (const [index, status] of statuses.entries()) {
      const [run] = await testApp.db
        .insert(testApp.schema.agentRuns)
        .values({
          organizationId: orgAId,
          taskId,
          agentId,
          objective: `Objetivo ${index}`,
          status,
          requestedByUserId: leadId,
          totalTokens: 100 * (index + 1),
          totalCostUsd: '0.001000',
        })
        .returning();
      if (!run) throw new Error('run não inserida');
      runIds.push(run.id);
    }
    await testApp.db
      .insert(testApp.schema.agentRuns)
      .values({ organizationId: orgAId, taskId: otherTaskId, agentId, objective: 'Outro projeto', status: 'completed' });
  });

  it('lista as execuções da organização com tarefa, projeto e quem disparou', async () => {
    const response = await http().get('/agent-runs').query({ projectId }).set(auth(leadToken)).expect(200);
    const items = response.body.items as { id: string; taskTitle: string; projectName: string; requestedByName: string | null }[];

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      taskTitle: 'Tarefa com execuções',
      projectName: 'Projeto Execuções',
      requestedByName: 'Lead A',
    });
    expect(items.map((item) => item.id).sort()).toEqual([...runIds].sort());
  });

  it('filtra por status e por projeto', async () => {
    const failed = await http()
      .get('/agent-runs')
      .query({ projectId, status: 'failed' })
      .set(auth(leadToken))
      .expect(200);
    expect(failed.body.items).toHaveLength(1);
    expect(failed.body.items[0].status).toBe('failed');

    const other = await http().get('/agent-runs').query({ projectId: otherProjectId }).set(auth(leadToken)).expect(200);
    expect(other.body.items).toHaveLength(1);
    expect(other.body.items[0].objective).toBe('Outro projeto');
  });

  it('pagina por cursor e isola o tenant; qualquer papel autenticado pode ler', async () => {
    const first = await http().get('/agent-runs').query({ projectId, limit: 2 }).set(auth(qaToken)).expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).not.toBeNull();

    const second = await http()
      .get('/agent-runs')
      .query({ projectId, limit: 2, cursor: first.body.nextCursor as string })
      .set(auth(qaToken))
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();

    const otherTenant = await http().get('/agent-runs').set(auth(leadBToken)).expect(200);
    expect(otherTenant.body.items).toEqual([]);
    await http().get('/agent-runs').expect(401);
    await http().get('/agent-runs').query({ status: 'inexistente' }).set(auth(leadToken)).expect(400);
  });
});
