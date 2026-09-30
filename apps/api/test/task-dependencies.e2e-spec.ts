import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite, sem mocks) para dependências entre tarefas: criar,
 * remover, ciclo, duplicata, projeto diferente, tenant, RBAC e projeto de
 * demonstração protegido.
 */
let testApp: TestApp;
let leadToken: string;
let qaToken: string;
let leadBToken: string;
let projectId: string;
let otherProjectId: string;

const password = 'demo1234';
const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [orgA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Deps E2E', slug: 'org-a-deps-e2e-test' })
    .returning();
  const [orgB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Deps E2E', slug: 'org-b-deps-e2e-test' })
    .returning();
  if (!orgA || !orgB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);
  await testApp.db.insert(testApp.schema.users).values([
    { organizationId: orgA.id, email: 'lead@a-deps.example', name: 'Lead A', role: 'tech_lead', passwordHash },
    { organizationId: orgA.id, email: 'qa@a-deps.example', name: 'QA A', role: 'qa_engineer', passwordHash },
    { organizationId: orgB.id, email: 'lead@b-deps.example', name: 'Lead B', role: 'tech_lead', passwordHash },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await http().post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  leadToken = await login('lead@a-deps.example');
  qaToken = await login('qa@a-deps.example');
  leadBToken = await login('lead@b-deps.example');

  projectId = (await http().post('/projects').set(auth(leadToken)).send({ name: 'Projeto Dependências' }).expect(201)).body.id as string;
  otherProjectId = (await http().post('/projects').set(auth(leadToken)).send({ name: 'Outro Projeto' }).expect(201)).body.id as string;
});

afterAll(async () => {
  await testApp.cleanup();
});

async function newTask(project: string, title: string): Promise<string> {
  const response = await http().post(`/projects/${project}/tasks`).set(auth(leadToken)).send({ title }).expect(201);
  return response.body.id as string;
}

const addDependency = (token: string, taskId: string, dependsOnTaskId: string) =>
  http().post(`/tasks/${taskId}/dependencies`).set(auth(token)).send({ dependsOnTaskId });

async function auditTargets(action: string): Promise<(string | null)[]> {
  const rows = await testApp.db.query.auditLogs.findMany({ where: (table, { eq }) => eq(table.action, action) });
  return rows.map((row) => row.targetId);
}

describe('POST /tasks/:id/dependencies', () => {
  it('cria a dependência, devolve a tarefa com ela e audita', async () => {
    const a = await newTask(projectId, 'A depende de B');
    const b = await newTask(projectId, 'B');

    const response = await addDependency(leadToken, a, b).expect(201);
    expect(response.body.dependencies).toHaveLength(1);
    expect(response.body.dependencies[0]).toMatchObject({ dependsOnTaskId: b, dependsOnTask: { id: b, title: 'B' } });

    const detail = await http().get(`/tasks/${a}`).set(auth(leadToken)).expect(200);
    expect(detail.body.dependencies).toHaveLength(1);
    expect(await auditTargets('task.dependency_added')).toContain(a);
  });

  it('400 para auto-dependência, tarefa inexistente ou de outro projeto; 409 para duplicata', async () => {
    const a = await newTask(projectId, 'Validações A');
    const b = await newTask(projectId, 'Validações B');
    const outsider = await newTask(otherProjectId, 'De outro projeto');

    expect((await addDependency(leadToken, a, a).expect(400)).body.message).toContain('dela mesma');
    await addDependency(leadToken, a, '00000000-0000-4000-8000-000000000000').expect(400);
    expect((await addDependency(leadToken, a, outsider).expect(400)).body.message).toContain('mesmo projeto');

    await addDependency(leadToken, a, b).expect(201);
    expect((await addDependency(leadToken, a, b).expect(409)).body.message).toContain('já existe');
  });

  it('409 quando a dependência criaria um ciclo (direto e transitivo)', async () => {
    const a = await newTask(projectId, 'Ciclo A');
    const b = await newTask(projectId, 'Ciclo B');
    const c = await newTask(projectId, 'Ciclo C');

    await addDependency(leadToken, a, b).expect(201);
    await addDependency(leadToken, b, c).expect(201);

    expect((await addDependency(leadToken, b, a).expect(409)).body.message).toContain('ciclo');
    expect((await addDependency(leadToken, c, a).expect(409)).body.message).toContain('ciclo');
    await addDependency(leadToken, a, c).expect(201);
  });

  it('403 sem task:manage, 404 cross-tenant/id inválido, 400 para corpo inválido e 401 sem token', async () => {
    const a = await newTask(projectId, 'Permissões A');
    const b = await newTask(projectId, 'Permissões B');

    await addDependency(qaToken, a, b).expect(403);
    await addDependency(leadBToken, a, b).expect(404);
    await http().post('/tasks/nao-e-uuid/dependencies').set(auth(leadToken)).send({ dependsOnTaskId: b }).expect(404);
    await http().post(`/tasks/${a}/dependencies`).set(auth(leadToken)).send({ dependsOnTaskId: 'x' }).expect(400);
    await http().post(`/tasks/${a}/dependencies`).send({ dependsOnTaskId: b }).expect(401);
  });

  it('403 no projeto de demonstração protegido', async () => {
    const demo = (await http().post('/projects').set(auth(leadToken)).send({ name: 'Forge Web App' }).expect(201)).body.id as string;
    const a = await newTask(demo, 'Demo A');
    const b = await newTask(demo, 'Demo B');
    await addDependency(leadToken, a, b).expect(403);
  });
});

describe('DELETE /tasks/:id/dependencies/:dependsOnTaskId', () => {
  it('remove a dependência e audita; 404 se ela não existe', async () => {
    const a = await newTask(projectId, 'Remover A');
    const b = await newTask(projectId, 'Remover B');
    await addDependency(leadToken, a, b).expect(201);

    await http().delete(`/tasks/${a}/dependencies/${b}`).set(auth(leadToken)).expect(204);
    const detail = await http().get(`/tasks/${a}`).set(auth(leadToken)).expect(200);
    expect(detail.body.dependencies).toEqual([]);
    expect(await auditTargets('task.dependency_removed')).toContain(a);

    await http().delete(`/tasks/${a}/dependencies/${b}`).set(auth(leadToken)).expect(404);
    await http().delete(`/tasks/${a}/dependencies/nao-e-uuid`).set(auth(leadToken)).expect(404);
  });

  it('403 sem task:manage e 404 cross-tenant', async () => {
    const a = await newTask(projectId, 'Remover permissões A');
    const b = await newTask(projectId, 'Remover permissões B');
    await addDependency(leadToken, a, b).expect(201);

    await http().delete(`/tasks/${a}/dependencies/${b}`).set(auth(qaToken)).expect(403);
    await http().delete(`/tasks/${a}/dependencies/${b}`).set(auth(leadBToken)).expect(404);
    const detail = await http().get(`/tasks/${a}`).set(auth(leadToken)).expect(200);
    expect(detail.body.dependencies).toHaveLength(1);
  });
});
