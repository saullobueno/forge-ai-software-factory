import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IndexableFile } from '@forge/knowledge';
import { FIXTURES_ROOT } from '../../infrastructure/repository-fs/repository-fs.service.js';

/**
 * Mesma lista de documentos que `packages/database/src/seed/knowledge-indexer.ts`
 * (`loadForgeProductKnowledgeFiles`) usa no seed — deliberadamente
 * duplicada aqui, não importada: aquele módulo lê via `node:fs` direto
 * porque `packages/database` não pode depender de `apps/api`
 * (`RepositoryFsService`/Nest DI); este arquivo lê o MESMO conteúdo sob
 * demanda, a partir de `apps/api`, que já resolve a raiz do monorepo a
 * partir de `FIXTURES_ROOT` (`dirname(FIXTURES_ROOT)`, mesmo truque já
 * usado por `agent-run-workspace.service.ts`). Manter as duas cópias em
 * sincronia é barato (2 caminhos fixos) — não compensa introduzir uma
 * dependência cruzada nova só para eliminar essa duplicação pequena.
 */
const REPO_ROOT = dirname(FIXTURES_ROOT);
const FORGE_PRODUCT_DOC_PATHS: readonly string[] = ['README.md', 'docs/threat-model.md'];

export async function loadForgeProductKnowledgeFiles(): Promise<IndexableFile[]> {
  const files: IndexableFile[] = [];

  for (const relativePath of FORGE_PRODUCT_DOC_PATHS) {
    try {
      const content = await readFile(join(REPO_ROOT, relativePath), 'utf8');
      files.push({ path: relativePath, content });
    } catch {
      // Documento opcional: se um dia for removido/renomeado, o reindex
      // simplesmente ignora — mesma degradação graciosa do seed.
    }
  }

  return files;
}
