import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './support/bootstrap-app.js';

/**
 * Prova de ponta a ponta do indexador automático real (Fase 12,
 * continuação): roda o MESMO `runSeed()` usado por `pnpm --filter
 * @forge/database db:seed` contra um PGlite efêmero real (via
 * `bootstrapTestApp`, migrações reais aplicadas do zero) e confirma que
 * `GET /projects/:id/knowledge`/`GET /projects/:id/knowledge/search`
 * expõem conteúdo indexado a partir de arquivos reais em disco
 * (`fixtures/acme-platform-web/` e os documentos reais do próprio Forge) —
 * nunca texto hardcoded no seed. Complementa (não substitui)
 * `packages/database/src/seed/run-seed.integration.test.ts`, que já cobre
 * o mesmo cenário no nível do banco; aqui a superfície testada é a rota
 * HTTP real que o frontend consome.
 */
let testApp: TestApp;
let projectId: string;
let techLeadToken: string;

beforeAll(async () => {
  const { bootstrapTestApp } = await import('./support/bootstrap-app.js');
  testApp = await bootstrapTestApp();

  const { runSeed, DEMO_PASSWORD } = await import('@forge/database');
  const summary = await runSeed(testApp.db);
  if (summary.alreadySeeded) {
    throw new Error('esperava um seed do zero num PGlite recém-migrado, mas encontrou dados pré-existentes.');
  }
  projectId = summary.projectId;

  const login = await request(testApp.app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'tech-lead@acme-platform.example', password: DEMO_PASSWORD })
    .expect(200);
  techLeadToken = login.body.token as string;
}, 60_000);

afterAll(async () => {
  await testApp.cleanup();
});

describe('db:seed real -> GET /projects/:id/knowledge (e2e)', () => {
  it('lista fontes indexadas a partir de arquivos reais do fixture e do próprio Forge, nunca hardcoded', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectId}/knowledge`)
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);

    const byTitle = new Map<string, (typeof response.body)[number]>(
      (response.body as { title: string }[]).map((source) => [source.title, source]),
    );

    // Código-fonte real do fixture, lido de verdade em disco pelo
    // indexador — não uma linha inventada no seed.
    const formatCurrencySource = byTitle.get('src/lib/format-currency.ts');
    expect(formatCurrencySource).toMatchObject({ kind: 'repository_doc' });
    expect(formatCurrencySource?.chunkCount).toBeGreaterThan(0);

    // Documento real do próprio Forge (conhecimento de organização/produto,
    // não específico deste projeto) — prova que o indexador também cobre
    // arquivos fora do fixture demo.
    const threatModelSource = byTitle.get('docs/threat-model.md');
    expect(threatModelSource).toMatchObject({ kind: 'repository_doc' });
    expect(threatModelSource?.chunkCount).toBeGreaterThan(0);
  });

  it('busca por um termo real do README do fixture e devolve o chunk correto, embrulhado como não confiável', async () => {
    // "estornos" só existe de verdade em fixtures/acme-platform-web/README.md
    // (confirmado: não aparece em nenhum outro documento indexado nesta
    // organização) — termo real do arquivo, não escolhido arbitrariamente
    // para o teste passar.
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectId}/knowledge/search`)
      .query({ q: 'estornos' })
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);

    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toMatchObject({
      uri: 'repo://acme-platform-web/README.md',
      kind: 'readme',
    });
    expect(response.body[0].content).toContain('estornos');
    expect(response.body[0].wrappedContent).toContain('<untrusted_knowledge>');
  });
});
