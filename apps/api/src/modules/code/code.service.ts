import { Injectable, NotFoundException } from '@nestjs/common';
import { RepositoryFsService, type TreeNode } from '../../infrastructure/repository-fs/repository-fs.service.js';
import { CodeRepository } from './code.repository.js';
import { extractTopLevelSymbols, type CodeSymbol } from './symbol-extractor.js';

export interface FileContentResult {
  path: string;
  content: string;
  sizeBytes: number;
  language: string;
  /** `null` para arquivos não-TypeScript — símbolos são "quando disponíveis" (spec §10). */
  symbols: CodeSymbol[] | null;
}

export interface SearchResultEntry {
  path: string;
  matchedInName: boolean;
  matchedInContent: boolean;
  /** Primeira linha de conteúdo que bateu a busca, já sem espaços nas pontas. */
  snippet: string | null;
}

export interface DiffEntry {
  id: string;
  filePath: string;
  changeType: string;
  patch: string;
  additions: number;
  deletions: number;
  beforeSizeBytes: number | null;
  afterSizeBytes: number | null;
  createdAt: Date;
}

const EXTENSION_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.css': 'css',
  '.html': 'html',
};

function languageFor(path: string): string {
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex === -1) return 'plaintext';
  return EXTENSION_LANGUAGE[path.slice(dotIndex).toLowerCase()] ?? 'plaintext';
}

function isTypeScriptFile(path: string): boolean {
  return path.endsWith('.ts') || path.endsWith('.tsx');
}

/**
 * Fase 5 — "Inteligência de código" (spec §10). Orquestra leitura de
 * arquivos em disco (`RepositoryFsService`, hoje um fixture estático —
 * comentário de substituição na Fase 10 em `repository-fs.service.ts`)
 * com os diffs/codeChanges já seedados no banco (`CodeRepository`).
 * Somente leitura: não existe (e não deveria existir nesta fase) nenhum
 * método de escrita — isso é Fase 7/8, quando agentes aplicam patches de
 * verdade via runner.
 */
@Injectable()
export class CodeService {
  constructor(
    private readonly codeRepository: CodeRepository,
    private readonly repositoryFs: RepositoryFsService,
  ) {}

  private async resolveRoot(projectId: string, organizationId: string): Promise<string> {
    const repository = await this.codeRepository.findRepositoryForProject(projectId, organizationId);
    if (!repository) {
      throw new NotFoundException('Repositório não encontrado.');
    }

    const root = this.repositoryFs.resolveRepositoryRoot(repository.name);
    await this.repositoryFs.ensureRepositoryExists(root);
    return root;
  }

  async getTree(projectId: string, organizationId: string): Promise<TreeNode[]> {
    const root = await this.resolveRoot(projectId, organizationId);
    return this.repositoryFs.getTree(root);
  }

  async getFile(projectId: string, organizationId: string, path: string): Promise<FileContentResult> {
    const root = await this.resolveRoot(projectId, organizationId);
    const file = await this.repositoryFs.readFile(root, path);
    const symbols = isTypeScriptFile(file.path) ? extractTopLevelSymbols(file.path, file.content) : null;

    return {
      path: file.path,
      content: file.content,
      sizeBytes: file.sizeBytes,
      language: languageFor(file.path),
      symbols,
    };
  }

  async search(projectId: string, organizationId: string, query: string): Promise<SearchResultEntry[]> {
    const root = await this.resolveRoot(projectId, organizationId);
    const files = await this.repositoryFs.listAllFiles(root);
    const needle = query.toLowerCase();

    const results: SearchResultEntry[] = [];
    for (const file of files) {
      const matchedInName = file.path.toLowerCase().includes(needle);
      const matchedInContent = file.content.toLowerCase().includes(needle);
      if (!matchedInName && !matchedInContent) continue;

      results.push({
        path: file.path,
        matchedInName,
        matchedInContent,
        snippet: matchedInContent ? this.firstMatchingLine(file.content, needle) : null,
      });
    }

    return results.sort((a, b) => a.path.localeCompare(b.path));
  }

  private firstMatchingLine(content: string, needleLower: string): string | null {
    const line = content.split('\n').find((candidate) => candidate.toLowerCase().includes(needleLower));
    return line ? line.trim() : null;
  }

  async getDiffs(projectId: string, organizationId: string): Promise<DiffEntry[]> {
    const codeChanges = await this.codeRepository.findCodeChangesForProject(projectId, organizationId);

    return codeChanges.flatMap((codeChange) =>
      codeChange.diffs.map((diff) => ({
        id: diff.id,
        filePath: codeChange.filePath,
        changeType: codeChange.changeType,
        patch: diff.patch,
        additions: diff.additions,
        deletions: diff.deletions,
        beforeSizeBytes: codeChange.beforeSnapshot?.sizeBytes ?? null,
        afterSizeBytes: codeChange.afterSnapshot?.sizeBytes ?? null,
        createdAt: diff.createdAt,
      })),
    );
  }
}
