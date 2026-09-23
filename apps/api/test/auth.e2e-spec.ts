import { hashPassword } from '@forge/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * e2e real contra banco real (PGlite + migrações aplicadas) — spec §22.
 * Cobre login com credenciais corretas/erradas, ausência de account
 * enumeration e a rota protegida `GET /auth/me` via header e via cookie.
 */
let testApp: TestApp;
const password = 'demo1234';
const userEmail = 'dev@acme-auth-e2e-test.example';

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const [organization] = await testApp.db
    .insert(testApp.schema.organizations)
    .values({ name: 'Acme Auth E2E', slug: 'acme-auth-e2e-test' })
    .returning();
  if (!organization) throw new Error('organization não inserida');

  await testApp.db.insert(testApp.schema.users).values({
    organizationId: organization.id,
    email: userEmail,
    name: 'Dev E2E',
    role: 'developer',
    passwordHash: await hashPassword(password),
  });
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('POST /auth/login', () => {
  it('retorna token e cookie httpOnly com credenciais corretas', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password })
      .expect(200);

    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user.email).toBe(userEmail);
    expect(response.body.user).not.toHaveProperty('passwordHash');

    const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
    expect(setCookie?.some((cookie) => cookie.startsWith('forge_session='))).toBe(true);
    expect(setCookie?.some((cookie) => /HttpOnly/i.test(cookie))).toBe(true);
  });

  it('retorna 401 genérico com senha errada', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: 'senha-errada' })
      .expect(401);

    expect(response.body.message).toBe('Credenciais inválidas.');
  });

  it('retorna exatamente o mesmo 401 genérico para um email inexistente (sem account enumeration)', async () => {
    const response = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nao-existe@acme-auth-e2e-test.example', password })
      .expect(401);

    expect(response.body.message).toBe('Credenciais inválidas.');
  });

  it('retorna 400 para corpo de requisição malformado', async () => {
    await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nao-e-um-email', password })
      .expect(400);
  });
});

describe('GET /auth/me', () => {
  it('retorna 401 sem token', async () => {
    await request(testApp.app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('retorna 401 com token inválido', async () => {
    await request(testApp.app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
  });

  it('retorna o usuário autenticado via Authorization: Bearer', async () => {
    const login = await request(testApp.app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password })
      .expect(200);

    const response = await request(testApp.app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.token as string}`)
      .expect(200);

    expect(response.body.email).toBe(userEmail);
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('retorna o usuário autenticado via cookie forge_session (sem header Authorization)', async () => {
    const agent = request.agent(testApp.app.getHttpServer());
    await agent.post('/auth/login').send({ email: userEmail, password }).expect(200);

    const response = await agent.get('/auth/me').expect(200);
    expect(response.body.email).toBe(userEmail);
  });
});
