import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações, sem mocks) para `GET /users` e para
 * responsável/etiquetas de tarefas (criar, editar, limpar, filtrar).
 */
let testApp: TestApp;
let leadToken: string;
let devToken: string;
let devId: string;
let leadId: string;
let leadBId: string;
let projectId: string;

const password = 'demo1234';
const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [orgA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Assignee E2E', slug: 'org-a-assignee-e2e-test' })
    .returning();
  const [orgB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Assignee E2E', slug: 'org-b-assignee-e2e-test' })
    .returning();
  if (!orgA || !orgB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);
  const users = await testApp.db
    .insert(testApp.schema.users)
    .values([
      { organizationId: orgA.id, email: 'lead@a-assignee.example', name: 'Ana Lead', role: 'tech_lead', passwordHash },
      { organizationId: orgA.id, email: 'dev@a-assignee.example', name: 'Bruno Dev', role: 'developer', passwordHash },
      { organizationId: orgB.id, email: 'lead@b-assignee.example', name: 'Carla Outra Org', role: 'tech_lead', passwordHash },
    ])
    .returning();
  const idOf = (email: string): string => users.find((user) => user.email === email)?.id ?? '';
  leadId = idOf('lead@a-assignee.example');
  devId = idOf('dev@a-assignee.example');
  leadBId = idOf('lead@b-assignee.example');

  const login = async (email: string): Promise<string> => {
    const response = await http().post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  leadToken = await login('lead@a-assignee.example');
  devToken = await login('dev@a-assignee.example');

  const project = await http().post('/projects').set(auth(leadToken)).send({ name: 'Projeto Responsáveis' }).expect(201);
  projectId = project.body.id as string;
});

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /users', () => {
  it('lista só os membros da organização, sem dados sensíveis', async () => {
    const response = await http().get('/users').set(auth(devToken)).expect(200);
    const members = response.body as Record<string, unknown>[];

    expect(members.map((member) => member['name'])).toEqual(['Ana Lead', 'Bruno Dev']);
    for (const member of members) {
      expect(Object.keys(member).sort()).toEqual(['avatarUrl', 'email', 'id', 'name', 'role']);
    }
  });

  it('401 sem token', async () => {
    await http().get('/users').expect(401);
  });
});

describe('responsável e etiquetas de tarefas', () => {
  it('cria com responsável e etiquetas', async () => {
    const response = await http()
      .post(`/projects/${projectId}/tasks`)
      .set(auth(leadToken))
      .send({ title: 'Com responsável', assigneeId: devId, labels: ['backend', 'urgente'] })
      .expect(201);

    expect(response.body).toMatchObject({ assigneeId: devId, labels: ['backend', 'urgente'] });
  });

  it('edita, troca e limpa o responsável e as etiquetas', async () => {
    const created = await http().post(`/projects/${projectId}/tasks`).set(auth(leadToken)).send({ title: 'Editável' }).expect(201);
    const taskId = created.body.id as string;
    expect(created.body).toMatchObject({ assigneeId: null, labels: [] });

    const assigned = await http()
      .patch(`/tasks/${taskId}`)
      .set(auth(devToken))
      .send({ assigneeId: leadId, labels: ['frontend'] })
      .expect(200);
    expect(assigned.body).toMatchObject({ assigneeId: leadId, labels: ['frontend'] });

    const cleared = await http().patch(`/tasks/${taskId}`).set(auth(devToken)).send({ assigneeId: null, labels: [] }).expect(200);
    expect(cleared.body).toMatchObject({ assigneeId: null, labels: [] });
  });

  it('400 para responsável de outra organização ou inexistente, e para etiquetas inválidas', async () => {
    const created = await http().post(`/projects/${projectId}/tasks`).set(auth(leadToken)).send({ title: 'Validações' }).expect(201);
    const taskId = created.body.id as string;

    const foreign = await http().patch(`/tasks/${taskId}`).set(auth(leadToken)).send({ assigneeId: leadBId }).expect(400);
    expect(foreign.body.message).toContain('Responsável inválido');
    await http()
      .patch(`/tasks/${taskId}`)
      .set(auth(leadToken))
      .send({ assigneeId: '00000000-0000-4000-8000-000000000000' })
      .expect(400);
    await http()
      .post(`/projects/${projectId}/tasks`)
      .set(auth(leadToken))
      .send({ title: 'Com responsável externo', assigneeId: leadBId })
      .expect(400);
    await http().patch(`/tasks/${taskId}`).set(auth(leadToken)).send({ labels: ['   '] }).expect(400);
    await http()
      .patch(`/tasks/${taskId}`)
      .set(auth(leadToken))
      .send({ labels: Array.from({ length: 21 }, (_, index) => `e${index}`) })
      .expect(400);
  });

  it('GET /tasks filtra por responsável e por "sem responsável"', async () => {
    const mine = await http().post(`/projects/${projectId}/tasks`).set(auth(leadToken)).send({ title: 'Filtro do Bruno', assigneeId: devId }).expect(201);
    const nobody = await http().post(`/projects/${projectId}/tasks`).set(auth(leadToken)).send({ title: 'Filtro sem dono' }).expect(201);

    const byAssignee = await http().get('/tasks').query({ assigneeId: devId }).set(auth(leadToken)).expect(200);
    const assignedIds = (byAssignee.body.items as { id: string; assigneeId: string }[]).map((task) => task.id);
    expect(assignedIds).toContain(mine.body.id);
    expect(assignedIds).not.toContain(nobody.body.id);
    expect((byAssignee.body.items as { assigneeId: string }[]).every((task) => task.assigneeId === devId)).toBe(true);

    const unassigned = await http().get('/tasks').query({ assigneeId: 'none' }).set(auth(leadToken)).expect(200);
    const unassignedIds = (unassigned.body.items as { id: string }[]).map((task) => task.id);
    expect(unassignedIds).toContain(nobody.body.id);
    expect(unassignedIds).not.toContain(mine.body.id);

    await http().get('/tasks').query({ assigneeId: 'nao-e-uuid' }).set(auth(leadToken)).expect(400);
  });
});
