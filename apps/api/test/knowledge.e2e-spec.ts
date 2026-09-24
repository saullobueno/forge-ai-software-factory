import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

let testApp: TestApp;
let projectAId: string;
let projectBId: string;
let developerAToken: string;
let qaEngineerAToken: string;
let developerBToken: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Knowledge E2E', slug: 'org-a-knowledge-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Knowledge E2E', slug: 'org-b-knowledge-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');

  const passwordHash = await hashPassword(password);

  const [developerA, qaEngineerA, developerB] = await testApp.db
    .insert(testApp.schema.users)
    .values([
      {
        organizationId: organizationA.id,
        email: 'dev@org-a-knowledge-e2e-test.example',
        name: 'Dev A',
        role: 'developer',
        passwordHash,
      },
      {
        organizationId: organizationA.id,
        email: 'qa@org-a-knowledge-e2e-test.example',
        name: 'QA A',
        role: 'qa_engineer',
        passwordHash,
      },
      {
        organizationId: organizationB.id,
        email: 'dev@org-b-knowledge-e2e-test.example',
        name: 'Dev B',
        role: 'developer',
        passwordHash,
      },
    ])
    .returning();
  if (!developerA || !qaEngineerA || !developerB) throw new Error('users não inseridos');

  const [projectA] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationA.id, name: 'Project A', slug: 'project-a-knowledge-e2e-test' })
    .returning();
  const [projectB] = await testApp.db
    .insert(testApp.schema.projects)
    .values({ organizationId: organizationB.id, name: 'Project B', slug: 'project-b-knowledge-e2e-test' })
    .returning();
  if (!projectA || !projectB) throw new Error('projects não inseridos');
  projectAId = projectA.id;
  projectBId = projectB.id;

  const [sourceA] = await testApp.db
    .insert(testApp.schema.knowledgeSources)
    .values({
      organizationId: organizationA.id,
      projectId: projectA.id,
      kind: 'adr',
      title: 'ADR tenant A',
      uri: 'demo://knowledge-e2e/a',
      version: '1',
    })
    .returning();
  const [sourceB] = await testApp.db
    .insert(testApp.schema.knowledgeSources)
    .values({
      organizationId: organizationB.id,
      projectId: projectB.id,
      kind: 'readme',
      title: 'README tenant B',
      uri: 'demo://knowledge-e2e/b',
      version: '1',
    })
    .returning();
  if (!sourceA || !sourceB) throw new Error('knowledge sources não inseridas');

  await testApp.db.insert(testApp.schema.knowledgeChunks).values([
    {
      knowledgeSourceId: sourceA.id,
      content: 'Arquitetura modular com isolamento por organizationId em todos os repositórios.',
      chunkIndex: 0,
      tokenCount: 12,
    },
    {
      knowledgeSourceId: sourceB.id,
      content: 'Conteúdo privado do tenant B que nunca deve aparecer para o tenant A.',
      chunkIndex: 0,
      tokenCount: 12,
    },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  developerAToken = await login('dev@org-a-knowledge-e2e-test.example');
  qaEngineerAToken = await login('qa@org-a-knowledge-e2e-test.example');
  developerBToken = await login('dev@org-b-knowledge-e2e-test.example');
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /projects/:id/knowledge', () => {
  it('lista fontes de conhecimento do projeto da própria organização', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/knowledge`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      title: 'ADR tenant A',
      kind: 'adr',
      chunkCount: 1,
      totalTokens: 12,
      riskyChunkCount: 0,
    });
    expect(JSON.stringify(response.body)).not.toContain('tenant B');
  });

  it('busca chunks escopados e devolve bloco embrulhado para uso seguro por agentes', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/knowledge/search`)
      .query({ q: 'arquitetura', limit: 3 })
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      title: 'ADR tenant A',
      chunkIndex: 0,
      score: 1,
      hasPromptInjectionRisk: false,
    });
    expect(response.body[0].wrappedContent).toContain('<untrusted_knowledge>');
    expect(JSON.stringify(response.body)).not.toContain('tenant B');
  });

  it('retorna 404 para projeto de outra organização, sem vazar existência', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectBId}/knowledge`)
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(404);
  });

  it('retorna 403 para usuário sem project:read', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/knowledge`)
      .set('Authorization', `Bearer ${qaEngineerAToken}`)
      .expect(403);
  });

  it('retorna 400 para busca vazia', async () => {
    await request(testApp.app.getHttpServer())
      .get(`/projects/${projectAId}/knowledge/search`)
      .query({ q: '' })
      .set('Authorization', `Bearer ${developerAToken}`)
      .expect(400);
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get(`/projects/${projectAId}/knowledge`).expect(401);
  });

  it('retorna 404 para id malformado', async () => {
    await request(testApp.app.getHttpServer())
      .get('/projects/nao-e-uuid/knowledge')
      .set('Authorization', `Bearer ${developerBToken}`)
      .expect(404);
  });
});
