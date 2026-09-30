import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migração 0006, sem mocks) para comentários e histórico
 * de atividade de tarefas: RBAC de apagar, tenant, demo protegida e ordem.
 */
let testApp: TestApp;
let leadToken: string;
let devToken: string;
let qaToken: string;
let leadBToken: string;
let projectId: string;

const password = 'demo1234';
const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [orgA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Comments E2E', slug: 'org-a-comments-e2e-test' })
    .returning();
  const [orgB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Comments E2E', slug: 'org-b-comments-e2e-test' })
    .returning();
  if (!orgA || !orgB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);
  await testApp.db.insert(testApp.schema.users).values([
    { organizationId: orgA.id, email: 'lead@a-comments.example', name: 'Ana Lead', role: 'tech_lead', passwordHash },
    { organizationId: orgA.id, email: 'dev@a-comments.example', name: 'Bruno Dev', role: 'developer', passwordHash },
    { organizationId: orgA.id, email: 'qa@a-comments.example', name: 'Carla QA', role: 'qa_engineer', passwordHash },
    { organizationId: orgB.id, email: 'lead@b-comments.example', name: 'Lead B', role: 'tech_lead', passwordHash },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await http().post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  leadToken = await login('lead@a-comments.example');
  devToken = await login('dev@a-comments.example');
  qaToken = await login('qa@a-comments.example');
  leadBToken = await login('lead@b-comments.example');

  projectId = (await http().post('/projects').set(auth(leadToken)).send({ name: 'Projeto Comentários' }).expect(201)).body.id as string;
});

afterAll(async () => {
  await testApp.cleanup();
});

async function newTask(title: string): Promise<string> {
  const response = await http().post(`/projects/${projectId}/tasks`).set(auth(devToken)).send({ title }).expect(201);
  return response.body.id as string;
}

const comment = (token: string, taskId: string, body: string) =>
  http().post(`/tasks/${taskId}/comments`).set(auth(token)).send({ body });

describe('comentários', () => {
  it('comenta (qualquer papel que lê a tarefa), lista em ordem e devolve o autor', async () => {
    const taskId = await newTask('Tarefa comentada');

    await comment(devToken, taskId, 'Primeiro comentário').expect(201);
    const response = await comment(qaToken, taskId, '  Segundo, com espaços  ').expect(201);

    const comments = response.body as { body: string; authorName: string }[];
    expect(comments.map((item) => [item.authorName, item.body])).toEqual([
      ['Bruno Dev', 'Primeiro comentário'],
      ['Carla QA', 'Segundo, com espaços'],
    ]);

    const list = await http().get(`/tasks/${taskId}/comments`).set(auth(leadToken)).expect(200);
    expect(list.body).toHaveLength(2);
  });

  it('400 para comentário vazio ou grande demais; 401 sem token; 404 cross-tenant e id inválido', async () => {
    const taskId = await newTask('Validações de comentário');
    await comment(devToken, taskId, '   ').expect(400);
    await comment(devToken, taskId, 'x'.repeat(4001)).expect(400);
    await http().post(`/tasks/${taskId}/comments`).send({ body: 'oi' }).expect(401);
    await comment(leadBToken, taskId, 'oi').expect(404);
    await http().get(`/tasks/${taskId}/comments`).set(auth(leadBToken)).expect(404);
    await comment(devToken, 'nao-e-uuid', 'oi').expect(404);
  });

  it('só o autor ou um tech lead/admin apaga; some da lista e audita', async () => {
    const taskId = await newTask('Apagar comentários');
    const first = (await comment(devToken, taskId, 'Do Bruno').expect(201)).body as { id: string }[];
    const commentId = first[0]?.id ?? '';

    await http().delete(`/tasks/${taskId}/comments/${commentId}`).set(auth(qaToken)).expect(403);
    await http().delete(`/tasks/${taskId}/comments/${commentId}`).set(auth(leadBToken)).expect(404);
    await http().delete(`/tasks/${taskId}/comments/${commentId}`).set(auth(devToken)).expect(204);
    await http().delete(`/tasks/${taskId}/comments/${commentId}`).set(auth(devToken)).expect(404);

    const second = (await comment(devToken, taskId, 'Outro do Bruno').expect(201)).body as { id: string }[];
    await http().delete(`/tasks/${taskId}/comments/${second[0]?.id ?? ''}`).set(auth(leadToken)).expect(204);

    const list = await http().get(`/tasks/${taskId}/comments`).set(auth(leadToken)).expect(200);
    expect(list.body).toEqual([]);
  });

  it('403 ao comentar no projeto de demonstração protegido', async () => {
    const demo = (await http().post('/projects').set(auth(leadToken)).send({ name: 'Forge Web App' }).expect(201)).body.id as string;
    const taskId = (await http().post(`/projects/${demo}/tasks`).set(auth(devToken)).send({ title: 'Tarefa da demo' }).expect(201)).body.id as string;
    await comment(devToken, taskId, 'spam').expect(403);
  });
});

describe('GET /tasks/:id/activity', () => {
  it('lista os eventos da tarefa, mais recentes primeiro, com quem agiu', async () => {
    const taskId = await newTask('Tarefa com histórico');
    await http().patch(`/tasks/${taskId}`).set(auth(leadToken)).send({ priority: 'urgent' }).expect(200);
    await http().post(`/tasks/${taskId}/status`).set(auth(devToken)).send({ status: 'planning' }).expect(200);
    await comment(qaToken, taskId, 'Registrado no histórico').expect(201);

    const response = await http().get(`/tasks/${taskId}/activity`).set(auth(qaToken)).expect(200);
    const activity = response.body as { action: string; actorName: string | null; metadata: Record<string, unknown> }[];

    expect(activity.map((item) => item.action)).toEqual([
      'task.comment_added',
      'task.status_changed',
      'task.updated',
      'task.created',
    ]);
    expect(activity[0]?.actorName).toBe('Carla QA');
    expect(activity[1]).toMatchObject({ actorName: 'Bruno Dev', metadata: { from: 'ready', to: 'planning' } });
    expect(activity[3]?.actorName).toBe('Bruno Dev');
  });

  it('404 cross-tenant e id inválido; 401 sem token', async () => {
    const taskId = await newTask('Atividade protegida');
    await http().get(`/tasks/${taskId}/activity`).set(auth(leadBToken)).expect(404);
    await http().get('/tasks/nao-e-uuid/activity').set(auth(leadToken)).expect(404);
    await http().get(`/tasks/${taskId}/activity`).expect(401);
  });
});
