import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { indexKnowledgeFiles, inferKnowledgeSourceKind } from './indexing.ts';
import { retrieveKnowledge } from './retrieval.ts';
import type { KnowledgeDocument } from './types.ts';

/**
 * `packages/knowledge/src/indexing.test.ts` está 2 níveis abaixo da raiz do
 * monorepo (`src` -> `knowledge` -> `packages`), mesmo raciocínio de
 * `FIXTURE_ROOT` em `packages/database/src/seed/fixtures.ts`.
 */
const currentDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(currentDir, '..', '..', '..');
const FIXTURE_README_PATH = join(REPO_ROOT, 'fixtures', 'acme-platform-web', 'README.md');

describe('indexKnowledgeFiles', () => {
  it('indexa o README real do fixture em chunks reais via chunkKnowledge (nunca hardcoded)', () => {
    const realContent = readFileSync(FIXTURE_README_PATH, 'utf8');
    // Sanity check de que o teste está mesmo lendo o arquivo real em disco,
    // não um texto embutido no teste.
    expect(realContent).toContain('estornos');

    const [source] = indexKnowledgeFiles([{ path: 'README.md', content: realContent }], {
      organizationId: 'org-1',
      projectId: 'project-1',
      workspaceId: null,
      uriPrefix: 'repo://acme-platform-web',
      version: null,
      maxTokens: 60,
      overlapTokens: 8,
    });

    expect(source).toBeDefined();
    expect(source?.kind).toBe('readme');
    expect(source?.title).toBe('README.md');
    expect(source?.uri).toBe('repo://acme-platform-web/README.md');
    expect(source?.chunks.length).toBeGreaterThan(0);
    expect(source?.chunks.every((chunk) => chunk.tokenCount > 0)).toBe(true);
    // O conteúdo de pelo menos um chunk precisa vir do arquivo real lido em
    // disco — não de um texto que o indexador tenha inventado.
    expect(source?.chunks.some((chunk) => chunk.content.includes('estornos'))).toBe(true);
    expect(source?.chunks.some((chunk) => chunk.content.includes('format-currency.ts'))).toBe(true);
  });

  it('retrieveKnowledge encontra de verdade o conteúdo indexado do README real do fixture', () => {
    const realContent = readFileSync(FIXTURE_README_PATH, 'utf8');
    const [source] = indexKnowledgeFiles([{ path: 'README.md', content: realContent }], {
      organizationId: 'org-1',
      projectId: 'project-1',
      workspaceId: null,
      uriPrefix: 'repo://acme-platform-web',
      version: null,
    });
    if (!source) throw new Error('esperava ao menos 1 fonte indexada a partir do README real');

    const documents: KnowledgeDocument[] = source.chunks.map((chunk) => ({
      sourceId: source.uri,
      organizationId: source.organizationId,
      projectId: source.projectId,
      workspaceId: source.workspaceId,
      kind: source.kind,
      title: source.title,
      uri: source.uri,
      version: source.version,
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
    }));

    // Termos que aparecem de verdade no README do fixture (ver conteúdo
    // lido acima) — não escolhidos arbitrariamente.
    const results = retrieveKnowledge({
      documents,
      query: 'estornos créditos sinal negativo',
      scope: { organizationId: 'org-1', projectId: 'project-1' },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.content).toContain('estornos');
    expect(results[0]?.uri).toBe('repo://acme-platform-web/README.md');
  });

  it('ignora arquivos vazios ou só com espaço em branco', () => {
    const sources = indexKnowledgeFiles([{ path: 'empty.md', content: '   \n  \t' }], {
      organizationId: 'org-1',
      projectId: null,
      workspaceId: null,
      uriPrefix: 'forge://forge-ai-software-factory',
      version: null,
    });

    expect(sources).toHaveLength(0);
  });

  it('produz uma fonte por arquivo, cada uma com sua própria uri e chunks', () => {
    const sources = indexKnowledgeFiles(
      [
        { path: 'src/lib/format-currency.ts', content: 'export function formatCurrency() { return 1; }' },
        { path: 'src/lib/invoice.ts', content: 'export function formatInvoiceSummary() { return 2; }' },
      ],
      {
        organizationId: 'org-1',
        projectId: 'project-1',
        workspaceId: null,
        uriPrefix: 'repo://acme-platform-web',
        version: null,
      },
    );

    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.uri)).toEqual([
      'repo://acme-platform-web/src/lib/format-currency.ts',
      'repo://acme-platform-web/src/lib/invoice.ts',
    ]);
    expect(sources.every((source) => source.kind === 'repository_doc')).toBe(true);
  });

  it('infere o kind certo a partir do nome/caminho real do arquivo', () => {
    expect(inferKnowledgeSourceKind('README.md')).toBe('readme');
    expect(inferKnowledgeSourceKind('docs/AGENTS.md')).toBe('agents_md');
    expect(inferKnowledgeSourceKind('CLAUDE.md')).toBe('claude_md');
    expect(inferKnowledgeSourceKind('docs/adr/0001-filas.md')).toBe('adr');
    expect(inferKnowledgeSourceKind('adr-002-cache.md')).toBe('adr');
    expect(inferKnowledgeSourceKind('docs/threat-model.md')).toBe('repository_doc');
    expect(inferKnowledgeSourceKind('src/lib/format-currency.ts')).toBe('repository_doc');
  });
});
