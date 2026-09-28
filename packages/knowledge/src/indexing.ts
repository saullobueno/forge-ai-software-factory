import type { KnowledgeSourceKind } from '@forge/types';
import { chunkKnowledge } from './chunking.ts';
import type { PreparedKnowledgeChunk } from './types.ts';

/**
 * Um arquivo real já lido em disco (por `RepositoryFsService` em
 * `apps/api`, por `node:fs` direto no seed, ou por qualquer outro
 * consumidor) — este módulo nunca faz I/O sozinho, só recebe conteúdo já
 * carregado. `path` é o caminho relativo à raiz indexada (repositório
 * demo, monorepo do Forge etc.), sempre com separador `/`.
 */
export interface IndexableFile {
  path: string;
  content: string;
}

export interface KnowledgeIndexOptions {
  organizationId: string;
  projectId: string | null;
  workspaceId: string | null;
  /**
   * Prefixo usado para montar `uri` (ex.: `repo://acme-platform-web` ou
   * `forge://forge-ai-software-factory`) — identifica de onde o arquivo
   * veio sem depender de um provider Git real.
   */
  uriPrefix: string;
  version: string | null;
  maxTokens?: number;
  overlapTokens?: number;
}

/**
 * Uma fonte de conhecimento pronta para persistir: falta só o `id` real do
 * banco (gerado no INSERT) — `chunks[].knowledgeSourceId` carrega um valor
 * placeholder (a própria `uri`) que quem persiste deve substituir pelo id
 * real da linha inserida, nunca reaproveitar como id definitivo.
 */
export interface IndexedKnowledgeSource {
  organizationId: string;
  projectId: string | null;
  workspaceId: string | null;
  kind: KnowledgeSourceKind;
  title: string;
  uri: string;
  version: string | null;
  chunks: PreparedKnowledgeChunk[];
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\/+/, '');
}

/**
 * Infere o `KnowledgeSourceKind` (spec §14, `@forge/types`) a partir do
 * caminho real do arquivo — nunca de um valor escolhido à mão por
 * documento. Regras, na ordem em que são checadas:
 * - `AGENTS.md`/`CLAUDE.md` (qualquer diretório) -> `agents_md`/`claude_md`.
 * - `README.md` -> `readme`.
 * - Qualquer arquivo dentro de um diretório `adr/` ou nomeado `adr-*`/`adr_*`
 *   -> `adr`.
 * - Qualquer outro arquivo (documentação `.md` ou código-fonte real, ex.
 *   `.ts`) -> `repository_doc` — não existe um `KnowledgeSourceKind`
 *   dedicado a "código-fonte" no schema (spec §14), então código como fonte
 *   de conhecimento cai no mesmo balde genérico de "documento do
 *   repositório".
 */
export function inferKnowledgeSourceKind(path: string): KnowledgeSourceKind {
  const normalized = normalizePath(path);
  const segments = normalized.toLowerCase().split('/');
  const base = segments.at(-1) ?? normalized.toLowerCase();

  if (base === 'agents.md') return 'agents_md';
  if (base === 'claude.md') return 'claude_md';
  if (base === 'readme.md') return 'readme';
  if (segments.includes('adr') || base.startsWith('adr-') || base.startsWith('adr_')) return 'adr';
  return 'repository_doc';
}

/**
 * Indexador real de conhecimento (Fase 12, continuação): recebe arquivos
 * reais já lidos (path + conteúdo) e devolve fontes/chunks prontos para
 * persistir, chunkados de verdade via `chunkKnowledge()` — nunca um chunk
 * escrito à mão. Arquivos vazios/só espaço em branco são ignorados (não faz
 * sentido indexar um documento sem conteúdo real).
 */
export function indexKnowledgeFiles(
  files: readonly IndexableFile[],
  options: KnowledgeIndexOptions,
): IndexedKnowledgeSource[] {
  const sources: IndexedKnowledgeSource[] = [];

  for (const file of files) {
    const content = file.content.trim();
    if (content.length === 0) continue;

    const normalizedPath = normalizePath(file.path);
    const uri = `${options.uriPrefix}/${normalizedPath}`;
    // `exactOptionalPropertyTypes` proíbe atribuir `undefined` explicitamente
    // a `maxTokens?`/`overlapTokens?` — só inclui a chave quando o chamador
    // realmente informou um valor, deixando `chunkKnowledge` aplicar seus
    // próprios defaults nos outros casos.
    const chunks = chunkKnowledge({
      sourceId: uri,
      content,
      ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      ...(options.overlapTokens !== undefined ? { overlapTokens: options.overlapTokens } : {}),
    });
    if (chunks.length === 0) continue;

    sources.push({
      organizationId: options.organizationId,
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      kind: inferKnowledgeSourceKind(normalizedPath),
      title: normalizedPath,
      uri,
      version: options.version,
      chunks,
    });
  }

  return sources;
}
