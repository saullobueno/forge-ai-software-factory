import { isRepositoryKnowledgeFile, type IndexableFile } from '@forge/knowledge';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `packages/database/src/seed/knowledge-indexer.ts` está 4 níveis abaixo da
 * raiz do monorepo (`seed` -> `src` -> `database` -> `packages`), mesmo
 * raciocínio de `FIXTURE_ROOT` em `fixtures.ts` e `SEED_REPO_ROOT` em
 * `run-seed.ts`.
 */
const currentDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(currentDir, '..', '..', '..', '..');
const FIXTURES_ROOT = join(REPO_ROOT, 'fixtures');

async function collectMatchingFiles(
  root: string,
  relativeDir: string,
  include: (relativePath: string) => boolean,
  out: IndexableFile[],
): Promise<void> {
  const absoluteDir = join(root, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries) {
    // Mesma filtragem de diretórios ocultos/`node_modules` que
    // `RepositoryFsService.getTree` (apps/api) já usa — reimplementada aqui
    // de forma mínima porque este script roda fora do Nest DI e
    // `packages/database` não pode depender de `apps/api` (a dependência
    // correta no monorepo vai de app para package, nunca o contrário).
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const entryRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await collectMatchingFiles(root, entryRelative, include, out);
    } else if (entry.isFile() && include(entryRelative)) {
      const content = await readFile(join(root, entryRelative), 'utf8');
      out.push({ path: entryRelative, content });
    }
  }
}

/**
 * Lista os arquivos reais do repositório demo (`fixtures/<repositoryName>`)
 * que fazem sentido indexar como conhecimento de projeto: o README do
 * repositório e o código-fonte real em `src/` (exceto testes). Percorre o
 * diretório de verdade em disco — um arquivo novo em `src/` aparece
 * automaticamente na próxima vez que o seed rodar, nada aqui é uma lista
 * fixa de nomes de arquivo.
 */
export async function loadFixtureKnowledgeFiles(repositoryName: string): Promise<IndexableFile[]> {
  const root = join(FIXTURES_ROOT, repositoryName);
  const files: IndexableFile[] = [];
  // `isRepositoryKnowledgeFile` (`@forge/knowledge`) é a mesma regra usada
  // pelo reindex sob demanda em `apps/api` (que varre a mesma árvore via
  // `RepositoryFsService` em vez de `node:fs` direto) — extraída para lá
  // justamente para as duas varreduras nunca divergirem sobre quais
  // arquivos contam como conhecimento de projeto.
  await collectMatchingFiles(root, '', isRepositoryKnowledgeFile, files);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Documentos reais sobre o próprio Forge (produto, não um projeto
 * específico) que fazem sentido como conhecimento de organização —
 * `projectId: null` no chamador, para aparecer em qualquer projeto da
 * organização (mesmo escopo que `knowledge.repository.ts` já resolve com
 * `isNull(projectId)`). Cada caminho é lido individualmente (não uma
 * varredura recursiva da raiz do monorepo, que arrastaria `node_modules`,
 * `fixtures/`, etc.) — um documento ausente é ignorado, não é erro fatal.
 */
const FORGE_PRODUCT_DOC_PATHS: readonly string[] = ['README.md', 'docs/threat-model.md'];

export async function loadForgeProductKnowledgeFiles(): Promise<IndexableFile[]> {
  const files: IndexableFile[] = [];

  for (const relativePath of FORGE_PRODUCT_DOC_PATHS) {
    try {
      const content = await readFile(join(REPO_ROOT, relativePath), 'utf8');
      files.push({ path: relativePath, content });
    } catch {
      // Documento opcional: se um dia for removido/renomeado, a indexação
      // simplesmente ignora — mesma degradação graciosa já usada em outros
      // pontos do seed (ex. `ensureDemoEnvironments` quando falta o
      // projeto demo).
    }
  }

  return files;
}
