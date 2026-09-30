import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações, sem mocks) para `POST /projects` e
 * `POST /projects/:id/tasks`. O projeto criado é vinculado ao repositório
 * demo (`fixtures/acme-platform-web/`), então o teste também prova que o
 * explorador de código e o disparo de execução de IA funcionam sobre um
 * projeto que nasceu pela API, não pelo seed.
 */
let testApp: TestApp;
let orgAId: string;
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
    .values({ name: 'Org A Projects Create E2E', slug: 'org-a-projects-create-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Projects Create E2E', slug: 'org-b-projects-create-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');
  orgAId = organizationA.id;

  await testApp.db.insert(testApp.schema.agents).values({
    organizationId: organizationA.id,
    role: 'planner',
    name: 'Planner A',
    description: 'Agente planner de teste',
  });

  const passwordHash = await hashPassword(password);
  await testApp.db.insert(testApp.schema.users).values([
    { organizationId: organizationA.id, email: 'lead@a-projects-create.example', name: 'Lead A', role: 'tech_lead', passwordHash },
    { organizationId: organizationA.id, email: 'dev@a-projects-create.example', name: 'Dev A', role: 'developer', passwordHash },
    { organizationId: organizationA.id, email: 'qa@a-projects-create.example', name: 'QA A', role: 'qa_engineer', passwordHash },
    { organizationId: organizationB.id, email: 'lead@b-projects-create.example', name: 'Lead B', role: 'tech_lead', passwordHash },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  techLeadAToken = await login('lead@a-projects-create.example');
  developerAToken = await login('dev@a-projects-create.example');
  qaAToken = await login('qa@a-projects-create.example');
  techLeadBToken = await login('lead@b-projects-create.example');
});

afterAll(async () => {
  await testApp.cleanup();
});

const createProject = (token: string, body: Record<string, unknown>) =>
  request(testApp.app.getHttpServer()).post('/projects').set('Authorization', `Bearer ${token}`).send(body);

describe('POST /projects', () => {
  it('cria o projeto com slug derivado do nome, techProfile e repositório demo vinculado', async () => {
    const response = await createProject(techLeadAToken, {
      name: 'Plataforma de Pagamentos',
      description: 'Serviço de cobrança',
      languages: ['typescript'],
      frameworks: ['nestjs'],
      packageManager: 'pnpm',
    }).expect(201);

    expect(response.body).toMatchObject({
      organizationId: orgAId,
      name: 'Plataforma de Pagamentos',
      slug: 'plataforma-de-pagamentos',
      description: 'Serviço de cobrança',
      techProfile: { languages: ['typescript'], frameworks: ['nestjs'], packageManager: 'pnpm' },
    });

    const repositories = await testApp.db.query.repositories.findMany({
      where: (table, { eq }) => eq(table.projectId, response.body.id as string),
    });
    expect(repositories).toHaveLength(1);
    expect(repositories[0]).toMatchObject({ provider: 'mock', owner: 'acme-platform', name: 'acme-platform-web' });

    const list = await request(testApp.app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);
    expect((list.body.items as { id: string }[]).some((project) => project.id === response.body.id)).toBe(true);

    const audit = await testApp.db.query.auditLogs.findMany({
      where: (table, { and, eq }) => and(eq(table.organizationId, orgAId), eq(table.action, 'project.created')),
    });
    expect(audit.some((entry) => entry.targetId === response.body.id)).toBe(true);
  });

  it('gera slugs únicos por organização para nomes repetidos', async () => {
    const first = await createProject(techLeadAToken, { name: 'Projeto Repetido' }).expect(201);
    const second = await createProject(techLeadAToken, { name: 'Projeto Repetido' }).expect(201);
    const third = await createProject(techLeadAToken, { name: 'Projeto Repetido' }).expect(201);

    expect(first.body.slug).toBe('projeto-repetido');
    expect(second.body.slug).toBe('projeto-repetido-2');
    expect(third.body.slug).toBe('projeto-repetido-3');
  });

  it('o slug de outra organização não interfere (o mesmo nome vira o slug base)', async () => {
    const response = await createProject(techLeadBToken, { name: 'Projeto Repetido' }).expect(201);
    expect(response.body.slug).toBe('projeto-repetido');
  });

  it('o repositório demo do projeto criado alimenta o explorador de código', async () => {
    const project = await createProject(techLeadAToken, { name: 'Projeto com Código' }).expect(201);

    const tree = await request(testApp.app.getHttpServer())
      .get(`/projects/${project.body.id as string}/repository/tree`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);
    expect(JSON.stringify(tree.body)).toContain('format-currency');
  });

  it('responde 403 para papel sem project:write (developer) e 401 sem token', async () => {
    await createProject(developerAToken, { name: 'Não Deve Criar' }).expect(403);
    await request(testApp.app.getHttpServer()).post('/projects').send({ name: 'Sem Token' }).expect(401);
  });

  it('responde 400 para corpo inválido (nome vazio ou ausente)', async () => {
    await createProject(techLeadAToken, { name: '   ' }).expect(400);
    await createProject(techLeadAToken, {}).expect(400);
  });
});

describe('POST /projects/:id/tasks', () => {
  let projectId: string;

  beforeAll(async () => {
    const project = await createProject(techLeadAToken, { name: 'Projeto com Tarefas' }).expect(201);
    projectId = project.body.id as string;
  });

  const createTask = (token: string, id: string, body: Record<string, unknown>) =>
    request(testApp.app.getHttpServer()).post(`/projects/${id}/tasks`).set('Authorization', `Bearer ${token}`).send(body);

  it('cria a tarefa pronta para execução, lista em GET /projects/:id/tasks e audita', async () => {
    const response = await createTask(developerAToken, projectId, {
      title: 'Corrigir formatação de moeda',
      description: 'Valores negativos aparecem errados',
      acceptanceCriteria: 'Estornos aparecem com sinal negativo',
      priority: 'high',
    }).expect(201);

    expect(response.body).toMatchObject({
      organizationId: orgAId,
      projectId,
      title: 'Corrigir formatação de moeda',
      priority: 'high',
      status: 'ready',
    });

    const list = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${techLeadAToken}`)
      .expect(200);
    expect((list.body as { id: string }[]).some((task) => task.id === response.body.id)).toBe(true);

    const audit = await testApp.db.query.auditLogs.findMany({
      where: (table, { and, eq }) => and(eq(table.organizationId, orgAId), eq(table.action, 'task.created')),
    });
    expect(audit.some((entry) => entry.targetId === response.body.id)).toBe(true);
  });

  it('usa prioridade "medium" por padrão', async () => {
    const response = await createTask(techLeadAToken, projectId, { title: 'Tarefa sem prioridade' }).expect(201);
    expect(response.body.priority).toBe('medium');
  });

  it('a tarefa criada pode disparar uma execução de IA', async () => {
    const task = await createTask(developerAToken, projectId, { title: 'Tarefa executável' }).expect(201);

    await request(testApp.app.getHttpServer())
      .post(`/tasks/${task.body.id as string}/agent-runs`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(201);
  });

  it('responde 403 para papel sem task:manage (qa_engineer) e 401 sem token', async () => {
    await createTask(qaAToken, projectId, { title: 'QA não cria' }).expect(403);
    await request(testApp.app.getHttpServer()).post(`/projects/${projectId}/tasks`).send({ title: 'Sem token' }).expect(401);
  });

  it('responde 404 genérico para projeto de outra organização ou id malformado', async () => {
    await createTask(techLeadBToken, projectId, { title: 'Cross-tenant' }).expect(404);
    await createTask(techLeadAToken, 'nao-e-um-uuid', { title: 'Id inválido' }).expect(404);
  });

  it('responde 400 para título vazio ou prioridade inválida', async () => {
    await createTask(techLeadAToken, projectId, { title: '' }).expect(400);
    await createTask(techLeadAToken, projectId, { title: 'Ok', priority: 'gigante' }).expect(400);
  });
});
