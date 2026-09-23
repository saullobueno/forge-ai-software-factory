import { Injectable, NotFoundException } from '@nestjs/common';
import { readFile as readFileAsync, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ArtifactContent {
  content: string;
  sizeBytes: number;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
/**
 * `apps/api/src/modules/artifacts` (ou `apps/api/dist/modules/artifacts`
 * depois de compilado) até a raiz do monorepo: `apps` -> `api` ->
 * `src`|`dist` -> `modules` -> `artifacts` = 5 segmentos, mesmo raciocínio
 * de `REPO_ROOT` em `repository-fs.service.ts`. `.data/` já está no
 * `.gitignore` da raiz — `packages/database/src/seed/run-seed.ts` grava
 * neste MESMO caminho (`.data/artifacts/`) ao seedar o artefato de teste
 * demo, calculando `REPO_ROOT` de forma independente a partir da própria
 * profundidade em disco (mesmo padrão, sem pacote compartilhado só para
 * esta constante).
 */
const REPO_ROOT = join(currentDir, '..', '..', '..', '..', '..');
export const ARTIFACTS_ROOT = join(REPO_ROOT, '.data', 'artifacts');

function normalizeStorageKey(storageKey: string): string {
  return storageKey.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function isEscapingRoot(relativeFromRoot: string): boolean {
  return relativeFromRoot === '..' || relativeFromRoot.startsWith(`..${sep}`) || isAbsolute(relativeFromRoot);
}

/**
 * Armazenamento de artefatos de teste em disco local (Fase 6 — spec §12:
 * "execuções de testes mostram... artefatos"). Substituto deliberado para
 * portfólio: um provider real (S3, GCS...) ficaria atrás desta mesma
 * interface em uma fase futura, sem tocar quem chama. Mesma disciplina de
 * segurança contra path traversal de `RepositoryFsService`
 * (`apps/api/src/infrastructure/repository-fs/repository-fs.service.ts`) — nunca deixa um
 * `storageKey` escapar de `ARTIFACTS_ROOT`, sempre 404 genérico (nunca
 * vazando se o alvo fora do escopo existe de verdade).
 */
@Injectable()
export class ArtifactStorageService {
  resolveWithinRoot(storageKey: string): string {
    const normalized = normalizeStorageKey(storageKey);
    const candidate = join(ARTIFACTS_ROOT, normalized);
    const relativeFromRoot = relative(ARTIFACTS_ROOT, candidate);
    if (isEscapingRoot(relativeFromRoot)) {
      throw new NotFoundException('Artefato não encontrado.');
    }
    return candidate;
  }

  async readContent(storageKey: string): Promise<ArtifactContent> {
    const absolutePath = this.resolveWithinRoot(storageKey);

    let info;
    try {
      info = await stat(absolutePath);
    } catch {
      throw new NotFoundException('Artefato não encontrado.');
    }
    if (!info.isFile()) {
      throw new NotFoundException('Artefato não encontrado.');
    }

    const content = await readFileAsync(absolutePath, 'utf8');
    return { content, sizeBytes: info.size };
  }
}
