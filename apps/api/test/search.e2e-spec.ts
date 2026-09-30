import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite, sem mocks) para `GET /search`: projetos, tarefas e
 * execuções, escopo por organização, RBAC (QA não vê projetos) e escape de
 * curingas do LIKE.
 */
let testApp: TestApp;
let leadToken: string;
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
    .values({ name: 'Org A Search E2E', slug: 'org-a-search-e2e-test' })
    .returning();
  const [orgB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Search E2E', slug: 'org-b-search-e2e-test' })
    .returning();
  if (!orgA || !orgB) throw new Error('organizations não inseridas');

  const [agent] = await testApp.db
    .insert(testApp.schema.agents)
    .values({ organizationId: orgA.id, role: 'planner', name: 'Planner A', description: 'Agente de teste' })
    .returning();
  if (!agent) throw new Error('agent não inserido');

  const passwordHash = await hashPassword(password);
  await testApp.db.insert(testApp.schema.users).values([
    { organizationId: orgA.id, email: 'lead@a-search.example', name: 'Lead A', role: 'tech_lead', passwordHash },
    { organizationId: orgA.id, email: 'qa@a-search.example', name: 'QA A', role: 'qa_engineer', passwordHash },
    { organizationId: orgB.id, email: 'lead@b-search.example', name: 'Lead B', role: 'tech_lead', passwordHash },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await http().post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  leadToken = await login('lead@a-search.example');
  qaToken = await login('qa@a-search.example');
  leadBToken = await login('lead@b-search.example');

  const project = (await http().post('/projects').set(auth(leadToken)).send({ name: 'Gateway de Pagamentos', description: 'Cobrança' }).expect(201)).body.id as string;
  const task = (await http().post(`/projects/${project}/tasks`).set(auth(leadToken)).send({ title: 'Migrar gateway para v2' }).expect(201)).body.id as string;
  await testApp.db
    .insert(testApp.schema.agentRuns)
    .values({ organizationId: orgA.id, taskId: task, agentId: agent.id, objective: 'Implementar: migrar gateway', status: 'completed' });

  const projectB = (await http().post('/projects').set(auth(leadBToken)).send({ name: 'Gateway secreto da outra org' }).expect(201)).body.id as string;
  await http().post(`/projects/${projectB}/tasks`).set(auth(leadBToken)).send({ title: 'Tarefa gateway de outra org' }).expect(201);
});

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /search', () => {
  it('acha projetos, tarefas e execuções por trecho, sem diferenciar maiúsculas', async () => {
    const response = await http().get('/search').query({ q: 'GATEWAY' }).set(auth(leadToken)).expect(200);

    expect(response.body.projects.map((hit: { name: string }) => hit.name)).toEqual(['Gateway de Pagamentos']);
    expect(response.body.tasks).toHaveLength(1);
    expect(response.body.tasks[0]).toMatchObject({ title: 'Migrar gateway para v2', projectName: 'Gateway de Pagamentos', status: 'ready' });
    expect(response.body.agentRuns).toHaveLength(1);
    expect(response.body.agentRuns[0]).toMatchObject({ objective: 'Implementar: migrar gateway', projectName: 'Gateway de Pagamentos' });
  });

  it('também acha o projeto pela descrição', async () => {
    const response = await http().get('/search').query({ q: 'cobran' }).set(auth(leadToken)).expect(200);
    expect(response.body.projects.map((hit: { name: string }) => hit.name)).toEqual(['Gateway de Pagamentos']);
  });

  it('nunca devolve dados de outra organização', async () => {
    const response = await http().get('/search').query({ q: 'outra org' }).set(auth(leadToken)).expect(200);
    expect(response.body).toEqual({ projects: [], tasks: [], agentRuns: [] });

    const other = await http().get('/search').query({ q: 'gateway' }).set(auth(leadBToken)).expect(200);
    expect(other.body.projects.map((hit: { name: string }) => hit.name)).toEqual(['Gateway secreto da outra org']);
    expect(other.body.agentRuns).toEqual([]);
  });

  it('QA lê tarefas e execuções, mas não vê projetos (sem project:read)', async () => {
    const response = await http().get('/search').query({ q: 'gateway' }).set(auth(qaToken)).expect(200);
    expect(response.body.projects).toEqual([]);
    expect(response.body.tasks).toHaveLength(1);
  });

  it('trata % e _ como texto literal e exige 2+ caracteres', async () => {
    const wildcard = await http().get('/search').query({ q: '%%' }).set(auth(leadToken)).expect(200);
    expect(wildcard.body).toEqual({ projects: [], tasks: [], agentRuns: [] });

    const tooShort = await http().get('/search').query({ q: 'g' }).set(auth(leadToken)).expect(200);
    expect(tooShort.body).toEqual({ projects: [], tasks: [], agentRuns: [] });
  });

  it('400 sem q e 401 sem token', async () => {
    await http().get('/search').set(auth(leadToken)).expect(400);
    await http().get('/search').query({ q: 'gateway' }).expect(401);
  });
});
