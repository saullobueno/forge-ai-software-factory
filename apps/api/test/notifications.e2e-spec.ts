import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite, sem mocks) para notificações dentro do app: geração
 * (responsável, aprovação pendente, execução concluída), leitura, links e
 * isolamento entre usuários e organizações.
 */
let testApp: TestApp;
let orgAId: string;
let agentId: string;
let leadId: string;
let devId: string;
let leadToken: string;
let devToken: string;
let qaToken: string;
let leadBToken: string;
let projectId: string;

const password = 'demo1234';
const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type Item = { id: string; kind: string; title: string; isRead: boolean; link: string | null };
async function notificationsOf(token: string): Promise<{ items: Item[]; unreadCount: number }> {
  const response = await http().get('/notifications').set(auth(token)).expect(200);
  return response.body as { items: Item[]; unreadCount: number };
}

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [orgA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Notifications E2E', slug: 'org-a-notifications-e2e-test' })
    .returning();
  const [orgB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Notifications E2E', slug: 'org-b-notifications-e2e-test' })
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
      { organizationId: orgA.id, email: 'lead@a-notif.example', name: 'Ana Lead', role: 'tech_lead', passwordHash },
      { organizationId: orgA.id, email: 'dev@a-notif.example', name: 'Bruno Dev', role: 'developer', passwordHash },
      { organizationId: orgA.id, email: 'qa@a-notif.example', name: 'Carla QA', role: 'qa_engineer', passwordHash },
      { organizationId: orgB.id, email: 'lead@b-notif.example', name: 'Lead B', role: 'tech_lead', passwordHash },
    ])
    .returning();
  leadId = users.find((user) => user.email === 'lead@a-notif.example')?.id ?? '';
  devId = users.find((user) => user.email === 'dev@a-notif.example')?.id ?? '';

  const login = async (email: string): Promise<string> => {
    const response = await http().post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  leadToken = await login('lead@a-notif.example');
  devToken = await login('dev@a-notif.example');
  qaToken = await login('qa@a-notif.example');
  leadBToken = await login('lead@b-notif.example');

  projectId = (await http().post('/projects').set(auth(leadToken)).send({ name: 'Projeto Notificações' }).expect(201)).body.id as string;
});

afterAll(async () => {
  await testApp.cleanup();
});

describe('tarefa atribuída', () => {
  it('avisa o novo responsável, com link para a tarefa, e não avisa quem se atribuiu', async () => {
    const created = await http()
      .post(`/projects/${projectId}/tasks`)
      .set(auth(leadToken))
      .send({ title: 'Tarefa para o Bruno', assigneeId: devId })
      .expect(201);
    const taskId = created.body.id as string;

    const dev = await notificationsOf(devToken);
    expect(dev.unreadCount).toBe(1);
    expect(dev.items[0]).toMatchObject({
      kind: 'task_assigned',
      title: 'Você foi designado para "Tarefa para o Bruno"',
      isRead: false,
      link: `/projects/${projectId}/tasks/${taskId}`,
    });

    await http().post(`/projects/${projectId}/tasks`).set(auth(leadToken)).send({ title: 'Auto-atribuída', assigneeId: leadId }).expect(201);
    expect((await notificationsOf(leadToken)).items.filter((item) => item.kind === 'task_assigned')).toEqual([]);
  });

  it('trocar o responsável por PATCH avisa o novo; repetir o mesmo não duplica', async () => {
    const taskId = (await http().post(`/projects/${projectId}/tasks`).set(auth(leadToken)).send({ title: 'Reatribuída' }).expect(201)).body.id as string;
    const before = (await notificationsOf(devToken)).items.length;

    await http().patch(`/tasks/${taskId}`).set(auth(leadToken)).send({ assigneeId: devId }).expect(200);
    await http().patch(`/tasks/${taskId}`).set(auth(leadToken)).send({ assigneeId: devId, priority: 'high' }).expect(200);

    expect((await notificationsOf(devToken)).items).toHaveLength(before + 1);
  });
});

describe('execuções de IA', () => {
  async function insertRun(status: 'approval_required' | 'executing'): Promise<{ runId: string; taskId: string }> {
    const taskId = (await http().post(`/projects/${projectId}/tasks`).set(auth(devToken)).send({ title: `Execução ${status}` }).expect(201)).body.id as string;
    const [run] = await testApp.db
      .insert(testApp.schema.agentRuns)
      .values({ organizationId: orgAId, taskId, agentId, objective: 'Objetivo', status, requestedByUserId: devId })
      .returning();
    if (!run) throw new Error('run não inserida');
    return { runId: run.id, taskId };
  }

  it('aprovação pendente avisa só quem pode aprovar; a decisão avisa quem disparou', async () => {
    const { NotificationsService } = await import('../src/modules/notifications/notifications.service.js');
    const { runId, taskId } = await insertRun('approval_required');
    await testApp.db.insert(testApp.schema.approvals).values({ organizationId: orgAId, subjectType: 'agent_run', subjectId: runId, status: 'pending' });

    await testApp.app.get(NotificationsService).notifyApprovalRequested(runId);

    const lead = await notificationsOf(leadToken);
    expect(lead.items.find((item) => item.kind === 'approval_requested')).toMatchObject({
      title: 'Aprovação pendente: Execução approval_required',
      link: `/projects/${projectId}/tasks/${taskId}/runs/${runId}`,
    });
    expect((await notificationsOf(devToken)).items.some((item) => item.kind === 'approval_requested')).toBe(false);
    expect((await notificationsOf(qaToken)).items.some((item) => item.kind === 'approval_requested')).toBe(false);

    await http().post(`/agent-runs/${runId}/approve`).set(auth(leadToken)).send({}).expect(200);

    const dev = await notificationsOf(devToken);
    expect(dev.items.find((item) => item.kind === 'agent_run_completed')).toMatchObject({
      title: 'Execução concluída: Execução approval_required',
      link: `/projects/${projectId}/tasks/${taskId}/runs/${runId}`,
    });
    expect((await notificationsOf(leadToken)).items.some((item) => item.kind === 'agent_run_completed')).toBe(false);
  });

  it('rejeitar avisa quem disparou que a execução falhou; cancelar não gera aviso', async () => {
    const rejected = await insertRun('approval_required');
    await http().post(`/agent-runs/${rejected.runId}/reject`).set(auth(leadToken)).send({}).expect(200);
    expect((await notificationsOf(devToken)).items.some((item) => item.kind === 'agent_run_failed' && item.link?.includes(rejected.runId))).toBe(true);

    const cancelled = await insertRun('executing');
    await http().post(`/agent-runs/${cancelled.runId}/cancel`).set(auth(devToken)).send({}).expect(200);
    expect((await notificationsOf(devToken)).items.some((item) => item.link?.includes(cancelled.runId))).toBe(false);
  });
});

describe('leitura e isolamento', () => {
  it('marca uma como lida, todas como lidas, e ninguém mexe nas de outro', async () => {
    const before = await notificationsOf(devToken);
    expect(before.unreadCount).toBeGreaterThan(1);
    const first = before.items[0] as Item;

    await http().post(`/notifications/${first.id}/read`).set(auth(devToken)).expect(204);
    const afterOne = await notificationsOf(devToken);
    expect(afterOne.unreadCount).toBe(before.unreadCount - 1);
    expect(afterOne.items.find((item) => item.id === first.id)?.isRead).toBe(true);

    const second = afterOne.items.find((item) => !item.isRead) as Item;
    await http().post(`/notifications/${second.id}/read`).set(auth(leadToken)).expect(404);
    await http().post(`/notifications/${second.id}/read`).set(auth(leadBToken)).expect(404);
    await http().post('/notifications/nao-e-uuid/read').set(auth(devToken)).expect(404);
    expect((await notificationsOf(devToken)).unreadCount).toBe(afterOne.unreadCount);

    await http().post('/notifications/read-all').set(auth(devToken)).expect(204);
    expect((await notificationsOf(devToken)).unreadCount).toBe(0);
    expect((await notificationsOf(leadToken)).unreadCount).toBeGreaterThan(0);
  });

  it('401 sem token e lista vazia para quem não recebeu nada', async () => {
    await http().get('/notifications').expect(401);
    expect(await notificationsOf(leadBToken)).toEqual({ items: [], unreadCount: 0 });
  });
});
