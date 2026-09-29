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
    // "estornos" é um termo real do README do fixture
    // (`fixtures/acme-platform-web/README.md`) — mas, ao contrário do que
    // este teste assumia antes desta continuação, NÃO é exclusivo dele:
    // `src/lib/format-currency.ts`/`src/lib/invoice.ts` também mencionam
    // "estornos" de verdade (confirmado por grep no fixture real). Com uma
    // query de um único termo, os três empatam no score lexical (1) — o
    // ranking híbrido (Fase 12, embeddings/ranking semântico) agora
    // desempata por similaridade de cosseno em vez de só ordem alfabética
    // do título, então este teste não assume mais qual dos três vem
    // primeiro, só que o chunk do README está presente, correto e
    // embrulhado, e que a resposta inteira respeita a ordenação
    // documentada (`hybridScore` decrescente).
    const response = await request(testApp.app.getHttpServer())
      .get(`/projects/${projectId}/knowledge/search`)
      .query({ q: 'estornos' })
      .set('Authorization', `Bearer ${techLeadToken}`)
      .expect(200);

    const searchResults = response.body as {
      uri: string;
      content: string;
      wrappedContent: string;
      hybridScore: number;
    }[];
    expect(searchResults.length).toBeGreaterThan(0);
    const readmeResult = searchResults.find(
      (result) => result.uri === 'repo://acme-platform-web/README.md',
    );
    expect(readmeResult).toMatchObject({ kind: 'readme', score: 1 });
    expect(readmeResult?.content).toContain('estornos');
    expect(readmeResult?.wrappedContent).toContain('<untrusted_knowledge>');

    for (let index = 1; index < searchResults.length; index += 1) {
      expect(searchResults[index - 1].hybridScore).toBeGreaterThanOrEqual(searchResults[index].hybridScore);
    }
  });
});
