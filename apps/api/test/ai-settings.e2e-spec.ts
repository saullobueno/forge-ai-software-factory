import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real (PGlite + migrações, sem mocks) das configurações de IA: provedor
 * por projeto, agentes configuráveis (`policy:manage`) e datasets versionados
 * do AI Playground (versões imutáveis, isolamento de tenant, avaliação por
 * `datasetVersionId`).
 */
let testApp: TestApp;
let orgAId: string;
let adminAToken: string;
let platformAToken: string;
let leadAToken: string;
let devAToken: string;
let platformBToken: string;
let devAId: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A AI Settings E2E', slug: 'org-a-ai-settings-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B AI Settings E2E', slug: 'org-b-ai-settings-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');
  orgAId = organizationA.id;

  await testApp.db.insert(testApp.schema.agents).values([
    { organizationId: organizationA.id, role: 'planner', name: 'Planner A', description: 'Planeja', allowedTools: ['get_issue'] },
    { organizationId: organizationB.id, role: 'planner', name: 'Planner B', description: 'Planeja' },
  ]);

  const passwordHash = await hashPassword(password);
  const users = await testApp.db
    .insert(testApp.schema.users)
    .values([
      { organizationId: organizationA.id, email: 'admin@a-ai-settings.example', name: 'Admin A', role: 'admin', passwordHash },
      { organizationId: organizationA.id, email: 'platform@a-ai-settings.example', name: 'Platform A', role: 'platform_engineer', passwordHash },
      { organizationId: organizationA.id, email: 'lead@a-ai-settings.example', name: 'Lead A', role: 'tech_lead', passwordHash },
      { organizationId: organizationA.id, email: 'dev@a-ai-settings.example', name: 'Dev A', role: 'developer', passwordHash },
      { organizationId: organizationB.id, email: 'platform@b-ai-settings.example', name: 'Platform B', role: 'platform_engineer', passwordHash },
    ])
    .returning();
  devAId = users.find((user) => user.email === 'dev@a-ai-settings.example')?.id ?? '';

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };
  adminAToken = await login('admin@a-ai-settings.example');
  platformAToken = await login('platform@a-ai-settings.example');
  leadAToken = await login('lead@a-ai-settings.example');
  devAToken = await login('dev@a-ai-settings.example');
  platformBToken = await login('platform@b-ai-settings.example');
});

afterAll(async () => {
  await testApp.cleanup();
});

const http = () => request(testApp.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function auditActions(action: string) {
  const rows = await testApp.db.query.auditLogs.findMany({
    where: (table, { and, eq }) => and(eq(table.organizationId, orgAId), eq(table.action, action)),
  });
  return rows.map((row) => row.targetId);
}

describe('provedor de IA por projeto', () => {
  it('lista os provedores disponíveis (mock sempre; reais só com chave e modelo) sem expor segredos', async () => {
    const response = await http().get('/ai/providers').set(auth(devAToken)).expect(200);
    expect(response.body).toEqual([{ name: 'mock', model: null, isDefault: true }]);
    await http().get('/ai/providers').expect(401);
  });

  it('define, troca e limpa o provedor do projeto; 400 para provedor sem chave e para nome inválido', async () => {
    const created = await http().post('/projects').set(auth(leadAToken)).send({ name: 'Projeto Provedor' }).expect(201);
    expect(created.body.aiProvider).toBeNull();

    const set = await http().patch(`/projects/${created.body.id}`).set(auth(leadAToken)).send({ aiProvider: 'mock' }).expect(200);
    expect(set.body.aiProvider).toBe('mock');

    await http().patch(`/projects/${created.body.id}`).set(auth(leadAToken)).send({ aiProvider: 'groq' }).expect(400);
    await http().patch(`/projects/${created.body.id}`).set(auth(leadAToken)).send({ aiProvider: 'skynet' }).expect(400);

    const cleared = await http().patch(`/projects/${created.body.id}`).set(auth(leadAToken)).send({ aiProvider: null }).expect(200);
    expect(cleared.body.aiProvider).toBeNull();
  });
});

describe('agentes', () => {
  it('403 sem policy:manage e 401 sem token', async () => {
    await http().get('/agents').set(auth(leadAToken)).expect(403);
    await http().get('/agents').expect(401);
  });

  it('lista só os agentes da própria organização', async () => {
    const response = await http().get('/agents').set(auth(platformAToken)).expect(200);
    expect(response.body.map((agent: { name: string }) => agent.name)).toEqual(['Planner A']);
  });

  it('edita nome, instruções, ferramentas e habilitação; audita; isola por tenant', async () => {
    const [agent] = (await http().get('/agents').set(auth(adminAToken)).expect(200)).body as { id: string }[];
    const id = agent?.id ?? '';

    const updated = await http()
      .patch(`/agents/${id}`)
      .set(auth(adminAToken))
      .send({
        name: 'Planner Personalizado',
        instructions: 'Responda sempre em português.',
        allowedTools: ['get_issue', 'list_files', 'list_files'],
        isEnabled: false,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Planner Personalizado',
      instructions: 'Responda sempre em português.',
      allowedTools: ['get_issue', 'list_files'],
      isEnabled: false,
    });
    expect(await auditActions('agent.updated')).toContain(id);

    const cleared = await http().patch(`/agents/${id}`).set(auth(adminAToken)).send({ instructions: null, isEnabled: true }).expect(200);
    expect(cleared.body).toMatchObject({ instructions: null, isEnabled: true });

    await http().patch(`/agents/${id}`).set(auth(platformBToken)).send({ name: 'Invasor' }).expect(404);
    await http().patch(`/agents/${id}`).set(auth(leadAToken)).send({ name: 'x' }).expect(403);
  });

  it('400 para ferramenta desconhecida ou corpo vazio; 404 para id inválido', async () => {
    const [agent] = (await http().get('/agents').set(auth(adminAToken)).expect(200)).body as { id: string }[];
    await http().patch(`/agents/${agent?.id}`).set(auth(adminAToken)).send({ allowedTools: ['formatar_disco'] }).expect(400);
    await http().patch(`/agents/${agent?.id}`).set(auth(adminAToken)).send({}).expect(400);
    await http().patch('/agents/nao-e-uuid').set(auth(adminAToken)).send({ name: 'x' }).expect(404);
  });
});

describe('datasets versionados do Playground', () => {
  const items = [{ id: 'caso-1', title: 'Caso 1', input: 'Cliente relata estorno com sinal errado.', expectedKeywords: ['estorno', 'sinal'] }];

  it('cria o dataset (v1), adiciona versões imutáveis e lista o histórico', async () => {
    const created = await http().post('/ai-playground/datasets').set(auth(leadAToken)).send({ name: 'Estornos', items }).expect(201);
    expect(created.body).toMatchObject({ name: 'Estornos', createdByName: 'Lead A' });
    expect(created.body.versions).toHaveLength(1);
    const id = created.body.id as string;

    const v2 = await http()
      .post(`/ai-playground/datasets/${id}/versions`)
      .set(auth(leadAToken))
      .send({ items: [...items, { id: 'caso-2', title: 'Caso 2', input: 'Deploy em produção.', expectedKeywords: ['rollback'] }], note: 'Adicionado caso de deploy' })
      .expect(201);
    expect(v2.body).toMatchObject({ version: 2, note: 'Adicionado caso de deploy', itemsCount: 2 });

    const detail = await http().get(`/ai-playground/datasets/${id}`).set(auth(leadAToken)).expect(200);
    expect(detail.body.versions.map((version: { version: number }) => version.version)).toEqual([2, 1]);

    const v1 = await http().get(`/ai-playground/datasets/${id}/versions/1`).set(auth(leadAToken)).expect(200);
    expect(v1.body.items).toHaveLength(1);

    const list = await http().get('/ai-playground/datasets').set(auth(leadAToken)).expect(200);
    const summary = list.body.find((dataset: { id: string }) => dataset.id === id);
    expect(summary.latestVersion.version).toBe(2);
    expect(await auditActions('playground_dataset.version_created')).toContain(id);
  });

  it('avalia por datasetVersionId (mesmo resultado que com os casos avulsos) e rejeita combinações inválidas', async () => {
    const created = await http().post('/ai-playground/datasets').set(auth(leadAToken)).send({ name: 'Avaliável', items }).expect(201);
    const versionId = created.body.versions[0].id as string;

    const viaVersion = await http()
      .post('/ai-playground/evaluations')
      .set(auth(leadAToken))
      .send({ prompt: 'Resuma o problema', models: ['forge-mock-fast'], datasetVersionId: versionId })
      .expect(201);
    const inline = await http()
      .post('/ai-playground/evaluations')
      .set(auth(leadAToken))
      .send({ prompt: 'Resuma o problema', models: ['forge-mock-fast'], dataset: items })
      .expect(201);
    expect(viaVersion.body.results[0].averageScore).toBe(inline.body.results[0].averageScore);

    await http()
      .post('/ai-playground/evaluations')
      .set(auth(leadAToken))
      .send({ prompt: 'x', datasetVersionId: versionId, dataset: items })
      .expect(400);
    await http().post('/ai-playground/evaluations').set(auth(leadAToken)).send({ prompt: 'x' }).expect(400);
    await http()
      .post('/ai-playground/evaluations')
      .set(auth(leadAToken))
      .send({ prompt: 'x', datasetVersionId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  });

  it('isolamento de tenant: a organização B não vê, não avalia nem altera datasets da A', async () => {
    const created = await http().post('/ai-playground/datasets').set(auth(leadAToken)).send({ name: 'Privado A', items }).expect(201);
    const id = created.body.id as string;
    const versionId = created.body.versions[0].id as string;

    const list = await http().get('/ai-playground/datasets').set(auth(platformBToken)).expect(200);
    expect(JSON.stringify(list.body)).not.toContain('Privado A');
    await http().get(`/ai-playground/datasets/${id}`).set(auth(platformBToken)).expect(404);
    await http().post(`/ai-playground/datasets/${id}/versions`).set(auth(platformBToken)).send({ items }).expect(404);
    await http().delete(`/ai-playground/datasets/${id}`).set(auth(platformBToken)).expect(404);
    await http().post('/ai-playground/evaluations').set(auth(platformBToken)).send({ prompt: 'x', datasetVersionId: versionId }).expect(404);
  });

  it('remoção: só o autor ou admin; apaga o histórico junto', async () => {
    const created = await http().post('/ai-playground/datasets').set(auth(leadAToken)).send({ name: 'Descartável', items }).expect(201);
    const id = created.body.id as string;

    await http().delete(`/ai-playground/datasets/${id}`).set(auth(platformAToken)).expect(403);
    await http().delete(`/ai-playground/datasets/${id}`).set(auth(leadAToken)).expect(204);
    await http().get(`/ai-playground/datasets/${id}`).set(auth(leadAToken)).expect(404);
    const versions = await testApp.db.query.playgroundDatasetVersions.findMany({
      where: (table, { eq }) => eq(table.datasetId, id),
    });
    expect(versions).toEqual([]);
    expect(devAId).not.toBe('');
  });

  it('400 para itens inválidos (vazio, mais de 5) e 404 para id inválido', async () => {
    await http().post('/ai-playground/datasets').set(auth(leadAToken)).send({ name: 'Vazio', items: [] }).expect(400);
    const many = Array.from({ length: 6 }, (_, index) => ({ id: `c${index}`, title: 'T', input: 'Entrada', expectedKeywords: [] }));
    await http().post('/ai-playground/datasets').set(auth(leadAToken)).send({ name: 'Muitos', items: many }).expect(400);
    await http().get('/ai-playground/datasets/nao-e-uuid').set(auth(leadAToken)).expect(404);
  });
});
