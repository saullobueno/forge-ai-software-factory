import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

let testApp: TestApp;
let techLeadToken: string;
let developerToken: string;
let organizationAId: string;

const password = 'demo1234';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organizationA] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org A Audit E2E', slug: 'org-a-audit-e2e-test' })
    .returning();
  const [organizationB] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Org B Audit E2E', slug: 'org-b-audit-e2e-test' })
    .returning();
  if (!organizationA || !organizationB) throw new Error('organizations não inseridas');
  organizationAId = organizationA.id;

  const passwordHash = await hashPassword(password);
  const [techLead, developer] = await testApp.db
    .insert(testApp.schema.users)
    .values([
      {
        organizationId: organizationA.id,
        email: 'tech-lead@org-a-audit-e2e-test.example',
        name: 'Tech Lead Audit',
        role: 'tech_lead',
        passwordHash,
      },
      {
        organizationId: organizationA.id,
        email: 'dev@org-a-audit-e2e-test.example',
        name: 'Developer Audit',
        role: 'developer',
        passwordHash,
      },
    ])
    .returning();
  if (!techLead || !developer) throw new Error('users não inseridos');

  await testApp.db.insert(testApp.schema.auditLogs).values([
    {
      organizationId: organizationA.id,
      actorType: 'user',
      actorUserId: techLead.id,
      action: 'policy.updated',
      targetType: 'policy',
      metadata: { source: 'e2e' },
    },
    {
      organizationId: organizationB.id,
      actorType: 'system',
      action: 'secret.rotated',
      targetType: 'secret_reference',
      metadata: { source: 'other-tenant' },
    },
  ]);

  const login = async (email: string): Promise<string> => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.token as string;
  };

  techLeadToken = await login('tech-lead@org-a-audit-e2e-test.example');
  developerToken = await login('dev@org-a-audit-e2e-test.example');
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('GET /audit-logs', () => {
  it('lista somente audit logs da própria organização para quem tem audit_log:read', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: organizationAId,
          action: 'policy.updated',
          targetType: 'policy',
          actorUser: {
            id: expect.any(String),
            name: 'Tech Lead Audit',
            email: 'tech-lead@org-a-audit-e2e-test.example',
            role: 'tech_lead',
          },
        }),
      ]),
    );
    expect((response.body as Array<{ organizationId: string }>).every((log) => log.organizationId === organizationAId)).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('secret.rotated');
  });

  it('retorna 403 para papel sem audit_log:read', async () => {
    await request(testApp.app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get('/audit-logs').expect(401);
  });
});
