import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações, sem mocks) para `PATCH`/`DELETE` de projetos
 * e tarefas: RBAC, isolamento de tenant, auditoria, bloqueio (409) por
 * execução de IA em andamento e limpeza das aprovações polimórficas (sem FK)
 * das execuções removidas junto.
 */
let testApp: TestApp;
let orgAId: string;
let agentId: string;
let techLeadAToken: string;
let developerAToken: string;
let qaAToken: string;
let techLeadBToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Projects Manage E2E', slug: 'org-a-projects-manage-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Projects Manage E2E', slug: 'org-b-projects-manage-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');
  orgAId = organizationA.id;

  const [agent] = await testApp.db
    .insert(testApp.schema.agents)
    .values({ organizationId: organizationA.id, role: 'planner', name: 'Planner A', description: 'Agente de teste' })
    .returning();
  if (!agent) throw new Error('agent não inserido');
  agentId = agent.id;

  const passwordHash = await hashPassword(password);
  await testApp.db.insert(testApp.schema.users).values([
    { organizationId: organizationA.id, email: 'lead@a-projects-manage.example', name: 'Lead A', role: 'tech_lead', passwordHash },
    { organizationId: organizationA.id, email: 'dev@a-projects-manage.example', name: 'Dev A', role: 'developer', passwordHash },
    { organizationId: organizationA.id, email: 'qa@a-projects-manage.example', name: 'QA A', role: 'qa_engineer', passwordHash },
    { organizationId: organizationB.id, email: 'lead@b-projects-manage.example', name: 'Lead B', role: 'tech_lead', passwordHash },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  techLeadAToken = await login('lead@a-projects-manage.example');
  developerAToken = await login('dev@a-projects-manage.example');
  qaAToken = await login('qa@a-projects-manage.example');
  techLeadBToken = await login('lead@b-projects-manage.example');
});

afterAll(async () => {
  await testApp.cleanup();
});

const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function newProject(name: string): Promise<string> {
  const response = await http().post('/projects').set(auth(techLeadAToken)).send({ name }).expect(201);
  return response.body.id as string;
}

async function newTask(projectId: string, title: string): Promise<string> {
  const response = await http().post(`/projects/${projectId}/tasks`).set(auth(developerAToken)).send({ title }).expect(201);
  return response.body.id as string;
}

async function insertRun(taskId: string, status: 'executing' | 'approval_required' | 'completed'): Promise<string> {
  const [run] = await testApp.db
    .insert(testApp.schema.agentRuns)
    .values({ organizationId: orgAId, taskId, agentId, objective: 'Objetivo de teste', status })
    .returning();
  if (!run) throw new Error('run não inserida');
  return run.id;
}

async function insertPendingApproval(runId: string): Promise<void> {
  await testApp.db
    .insert(testApp.schema.approvals)
    .values({ organizationId: orgAId, subjectType: 'agent_run', subjectId: runId, status: 'pending' });
}

async function approvalsFor(runId: string) {
  return testApp.db.query.approvals.findMany({ where: (table, { eq }) => eq(table.subjectId, runId) });
}

async function auditActions(action: string) {
  const rows = await testApp.db.query.auditLogs.findMany({
    where: (table, { and, eq }) => and(eq(table.organizationId, orgAId), eq(table.action, action)),
  });
  return rows.map((row) => row.targetId);
}

describe('PATCH /projects/:id', () => {
  it('atualiza campos, mescla o techProfile, preserva o slug e audita', async () => {
    const id = await newProject('Projeto Editável');
    await http()
      .patch(`/projects/${id}`)
      .set(auth(techLeadAToken))
      .send({ languages: ['typescript'], frameworks: ['nestjs'], packageManager: 'pnpm' })
      .expect(200);

    const response = await http()
      .patch(`/projects/${id}`)
      .set(auth(techLeadAToken))
      .send({ name: 'Projeto Renomeado', description: 'Nova descrição', codeRules: 'Sem any', frameworks: ['next.js'] })
      .expect(200);

    expect(response.body).toMatchObject({
      name: 'Projeto Renomeado',
      slug: 'projeto-editavel',
      description: 'Nova descrição',
      codeRules: 'Sem any',
      techProfile: { languages: ['typescript'], frameworks: ['next.js'], packageManager: 'pnpm' },
    });
    expect(await auditActions('project.updated')).toContain(id);
  });

  it('null limpa um campo opcional', async () => {
    const id = await newProject('Projeto Com Descrição');
    await http().patch(`/projects/${id}`).set(auth(techLeadAToken)).send({ description: 'Texto' }).expect(200);
    const response = await http().patch(`/projects/${id}`).set(auth(techLeadAToken)).send({ description: null }).expect(200);
    expect(response.body.description).toBeNull();
  });

  it('403 sem project:write, 401 sem token, 404 cross-tenant/id inválido e 400 para corpo vazio ou inválido', async () => {
    const id = await newProject('Projeto Protegido');
    await http().patch(`/projects/${id}`).set(auth(developerAToken)).send({ name: 'x' }).expect(403);
    await http().patch(`/projects/${id}`).send({ name: 'x' }).expect(401);
    await http().patch(`/projects/${id}`).set(auth(techLeadBToken)).send({ name: 'x' }).expect(404);
    await http().patch('/projects/nao-e-uuid').set(auth(techLeadAToken)).send({ name: 'x' }).expect(404);
    await http().patch(`/projects/${id}`).set(auth(techLeadAToken)).send({}).expect(400);
    await http().patch(`/projects/${id}`).set(auth(techLeadAToken)).send({ name: '   ' }).expect(400);
  });
});

describe('DELETE /projects/:id', () => {
  it('exclui o projeto com tarefas, execuções e aprovações pendentes das execuções, e audita', async () => {
    const id = await newProject('Projeto Descartável');
    const taskId = await newTask(id, 'Tarefa do projeto');
    const runId = await insertRun(taskId, 'approval_required');
    await insertPendingApproval(runId);

    await http().delete(`/projects/${id}`).set(auth(techLeadAToken)).expect(204);

    await http().get(`/projects/${id}`).set(auth(techLeadAToken)).expect(404);
    await http().get(`/tasks/${taskId}`).set(auth(techLeadAToken)).expect(404);
    expect(await approvalsFor(runId)).toHaveLength(0);
    expect(await auditActions('project.deleted')).toContain(id);
  });

  it('409 enquanto houver execução de IA em andamento, e libera depois que ela termina', async () => {
    const id = await newProject('Projeto Ocupado');
    const taskId = await newTask(id, 'Tarefa ocupada');
    const runId = await insertRun(taskId, 'executing');

    const blocked = await http().delete(`/projects/${id}`).set(auth(techLeadAToken)).expect(409);
    expect(blocked.body.message).toContain('execuções de IA em andamento');
    await http().get(`/projects/${id}`).set(auth(techLeadAToken)).expect(200);

    // Import dinâmico: `@forge/database` lê DATABASE_LOCAL_PATH no import, então
    // um import estático no topo faria este arquivo usar o banco de DEV.
    const { eq } = await import('@forge/database');
    await testApp.db
      .update(testApp.schema.agentRuns)
      .set({ status: 'completed' })
      .where(eq(testApp.schema.agentRuns.id, runId));
    await http().delete(`/projects/${id}`).set(auth(techLeadAToken)).expect(204);
  });

  it('403 sem project:write, 404 cross-tenant e id inválido', async () => {
    const id = await newProject('Projeto Blindado');
    await http().delete(`/projects/${id}`).set(auth(developerAToken)).expect(403);
    await http().delete(`/projects/${id}`).set(auth(techLeadBToken)).expect(404);
    await http().delete('/projects/nao-e-uuid').set(auth(techLeadAToken)).expect(404);
    await http().get(`/projects/${id}`).set(auth(techLeadAToken)).expect(200);
  });
});

describe('PATCH /tasks/:id', () => {
  it('atualiza título, prioridade e critérios, sem mexer no status, e audita', async () => {
    const projectId = await newProject('Projeto de Tarefas Editáveis');
    const taskId = await newTask(projectId, 'Título original');

    const response = await http()
      .patch(`/tasks/${taskId}`)
      .set(auth(developerAToken))
      .send({ title: 'Título novo', priority: 'urgent', acceptanceCriteria: 'Critério novo' })
      .expect(200);

    expect(response.body).toMatchObject({
      id: taskId,
      title: 'Título novo',
      priority: 'urgent',
      acceptanceCriteria: 'Critério novo',
      status: 'ready',
    });
    expect(await auditActions('task.updated')).toContain(taskId);
  });

  it('403 sem task:manage, 404 cross-tenant/id inválido e 400 para corpo vazio ou inválido', async () => {
    const projectId = await newProject('Projeto de Tarefas Protegidas');
    const taskId = await newTask(projectId, 'Tarefa protegida');
    await http().patch(`/tasks/${taskId}`).set(auth(qaAToken)).send({ title: 'x' }).expect(403);
    await http().patch(`/tasks/${taskId}`).set(auth(techLeadBToken)).send({ title: 'x' }).expect(404);
    await http().patch('/tasks/nao-e-uuid').set(auth(techLeadAToken)).send({ title: 'x' }).expect(404);
    await http().patch(`/tasks/${taskId}`).set(auth(techLeadAToken)).send({}).expect(400);
    await http().patch(`/tasks/${taskId}`).set(auth(techLeadAToken)).send({ priority: 'gigante' }).expect(400);
  });
});

describe('DELETE /tasks/:id', () => {
  it('exclui a tarefa, some da lista, remove aprovações das execuções e audita', async () => {
    const projectId = await newProject('Projeto de Tarefas Descartáveis');
    const taskId = await newTask(projectId, 'Tarefa descartável');
    const runId = await insertRun(taskId, 'approval_required');
    await insertPendingApproval(runId);

    await http().delete(`/tasks/${taskId}`).set(auth(developerAToken)).expect(204);

    const list = await http().get(`/projects/${projectId}/tasks`).set(auth(techLeadAToken)).expect(200);
    expect((list.body as { id: string }[]).some((task) => task.id === taskId)).toBe(false);
    expect(await approvalsFor(runId)).toHaveLength(0);
    expect(await auditActions('task.deleted')).toContain(taskId);
    await http().get(`/projects/${projectId}`).set(auth(techLeadAToken)).expect(200);
  });

  it('409 com execução de IA em andamento; 403 sem task:manage; 404 cross-tenant', async () => {
    const projectId = await newProject('Projeto de Tarefa Ocupada');
    const taskId = await newTask(projectId, 'Tarefa ocupada');
    await insertRun(taskId, 'executing');

    await http().delete(`/tasks/${taskId}`).set(auth(developerAToken)).expect(409);
    await http().delete(`/tasks/${taskId}`).set(auth(qaAToken)).expect(403);
    await http().delete(`/tasks/${taskId}`).set(auth(techLeadBToken)).expect(404);
    await http().get(`/tasks/${taskId}`).set(auth(developerAToken)).expect(200);
  });
});

describe('projeto de demonstração protegido (slug forge-web-app)', () => {
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    const response = await http().post('/projects').set(auth(techLeadAToken)).send({ name: 'Forge Web App' }).expect(201);
    expect(response.body.slug).toBe('forge-web-app');
    projectId = response.body.id as string;
    taskId = await newTask(projectId, 'Tarefa da demonstração');
  });

  it('expõe isProtected: true no projeto protegido e false nos demais', async () => {
    const protectedProject = await http().get(`/projects/${projectId}`).set(auth(techLeadAToken)).expect(200);
    expect(protectedProject.body.isProtected).toBe(true);

    const regularId = await newProject('Projeto Comum Desprotegido');
    const regular = await http().get(`/projects/${regularId}`).set(auth(techLeadAToken)).expect(200);
    expect(regular.body.isProtected).toBe(false);

    const list = await http().get('/projects').set(auth(techLeadAToken)).expect(200);
    const flags = new Map((list.body.items as { id: string; isProtected: boolean }[]).map((item) => [item.id, item.isProtected]));
    expect(flags.get(projectId)).toBe(true);
    expect(flags.get(regularId)).toBe(false);
  });

  it('403 ao editar ou excluir o projeto, mesmo para tech lead', async () => {
    const patch = await http().patch(`/projects/${projectId}`).set(auth(techLeadAToken)).send({ name: 'Vandalizado' }).expect(403);
    expect(patch.body.message).toContain('projeto de demonstração');
    await http().delete(`/projects/${projectId}`).set(auth(techLeadAToken)).expect(403);
    const still = await http().get(`/projects/${projectId}`).set(auth(techLeadAToken)).expect(200);
    expect(still.body.name).toBe('Forge Web App');
  });

  it('403 ao editar ou excluir tarefas do projeto, mas ainda permite criar tarefas', async () => {
    await http().patch(`/tasks/${taskId}`).set(auth(developerAToken)).send({ title: 'Vandalizada' }).expect(403);
    await http().delete(`/tasks/${taskId}`).set(auth(developerAToken)).expect(403);
    await http().get(`/tasks/${taskId}`).set(auth(developerAToken)).expect(200);
    await http().post(`/projects/${projectId}/tasks`).set(auth(developerAToken)).send({ title: 'Nova tarefa é permitida' }).expect(201);
  });
});
