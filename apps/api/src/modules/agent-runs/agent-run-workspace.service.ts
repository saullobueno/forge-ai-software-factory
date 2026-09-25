import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolveInsideWorkspace } from '@forge/sandbox';
import { applyPatch } from 'diff';
import { FIXTURES_ROOT } from '../../infrastructure/repository-fs/repository-fs.service.js';

/**
 * `dirname(FIXTURES_ROOT)` em vez de recalcular `REPO_ROOT` a partir de
 * `import.meta.url` (o padrão usado por `RepositoryFsService`/
 * `ArtifactStorageService`): `FIXTURES_ROOT` já É `join(REPO_ROOT,
 * 'fixtures')`, então subir um nível chega na raiz do monorepo sem duplicar
 * a lógica de "quantos `..` até a raiz" pela terceira vez neste app.
 * `.data/` já está no `.gitignore` da raiz (regra genérica cobre todo `.data/` do monorepo).
 */
const REPO_ROOT = dirname(FIXTURES_ROOT);
export const WORKSPACES_ROOT = join(REPO_ROOT, '.data', 'workspaces');

export interface ApplyApprovedWriteInput {
  /**
   * Chave de isolamento do workspace descartável — o `id` da linha de
   * `repositories` (UUID, globalmente único e por natureza já escopado por
   * `organizationId`, já que cada linha de `repositories` pertence a uma
   * única organização). Deliberadamente NÃO é `agentRuns.id`: múltiplas
   * execuções aprovadas ao longo do tempo sobre o MESMO projeto/repositório
   * compartilham a mesma cópia (persistente entre execuções, mas sempre
   * isolada do fixture original) — é assim que um patch aprovado numa
   * execução pode legitimamente falhar ao aplicar numa execução seguinte
   * (o arquivo já mudou desde então), o cenário que este módulo precisa
   * tratar como erro real, não mascarar.
   */
  repositoryId: string;
  /** Nome do fixture em `fixtures/<repositoryName>` — a origem, somente leitura, da cópia. */
  repositoryName: string;
  /** `result.proposed.path` gravado pelo orquestrador (Fase 7) ao registrar a tool call como `pending`. */
  proposedPath: unknown;
  /** `result.proposed.patch` — sempre um unified diff, mesmo quando `toolName` é `write_file` (ver `packages/ai/src/mock-provider.ts`). */
  proposedPatch: unknown;
}

export type ApplyApprovedWriteResult =
  | {
      ok: true;
      result: {
        path: string;
        sizeBytes: number;
        sha256: string;
        appliedAt: string;
        note: string;
        /**
         * Estado do arquivo ANTES desta escrita, na mesma cópia isolada do
         * workspace (Fase 10 continuação — precisa disso para gravar
         * `file_snapshots`/`code_changes` reais de "antes"/"depois", não só
         * o resultado final). `null` quando o arquivo ainda não existia
         * (`fileExistedBefore: false`, ex.: `apply_patch` criando um arquivo
         * novo) — não há "antes" real para capturar.
         */
        beforeSha256: string | null;
        beforeSizeBytes: number | null;
        fileExistedBefore: boolean;
      };
    }
  | { ok: false; result: { error: string; path?: string } };

/**
 * Conecta execução REAL (mas deliberadamente limitada) atrás da aprovação
 * humana (spec §18, Fase 17 -> este trabalho): só `write_file`/`apply_patch`
 * viram efeito real em disco, e só contra uma cópia isolada e descartável do
 * repositório demo — nunca `fixtures/<repositoryName>/` original, que é
 * conteúdo de demonstração rastreado pelo próprio git deste monorepo.
 *
 * `run_command`/`run_tests` e `create_commit`/`create_pull_request`
 * continuam simulados de propósito (ver `AgentRunsService.decide` — nenhum
 * método deste serviço spawna processo ou toca git): o
 * `LocalProcessSandboxRunner` (`@forge/sandbox`) é o único runner disponível
 * nesta máquina de desenvolvimento (sem Docker) e não isola rede — rodar um
 * comando real a partir de uma proposta de IA exigiria `DockerSandboxRunner`
 * com `--network=none` ou equivalente, que não está disponível aqui.
 *
 * A validação de path fica inteiramente por conta de
 * `resolveInsideWorkspace` (`@forge/sandbox/path-policy`) — a mesma função
 * que `LocalProcessSandboxRunner` usa para `cwd`, reaproveitada aqui sem
 * reimplementar a disciplina de path traversal.
 */
@Injectable()
export class AgentRunWorkspaceService {
  workspaceRoot(repositoryId: string): string {
    return join(WORKSPACES_ROOT, repositoryId);
  }

  /**
   * Copia `fixtures/<repositoryName>` inteiro para a cópia isolada deste
   * `repositoryId` na primeira vez que alguma tool call de escrita desta
   * (ou de uma execução futura sobre o mesmo repositório) precisa dela —
   * idempotente: se o diretório já existir (de uma execução aprovada
   * anterior), não sobrescreve o que já foi escrito de verdade nele.
   */
  async ensureWorkspaceCopy(repositoryId: string, repositoryName: string): Promise<string> {
    const root = this.workspaceRoot(repositoryId);
    const alreadyExists = await stat(root)
      .then((info) => info.isDirectory())
      .catch(() => false);

    if (!alreadyExists) {
      const source = join(FIXTURES_ROOT, repositoryName);
      await mkdir(WORKSPACES_ROOT, { recursive: true });
      // `fs.cp` copia para um diretório novo — nunca sobrescreve/apaga
      // `source` (o fixture original permanece intocado, sempre leitura).
      await cp(source, root, { recursive: true });
    }

    return root;
  }

  /**
   * Aplica de verdade uma tool call de escrita aprovada. Nunca lança —
   * todo caminho de falha (patch ausente/inválido, caminho fora do
   * workspace, patch que não aplica limpo sobre o conteúdo atual da cópia)
   * volta como `{ ok: false }` para quem chama decidir o destino da
   * execução (`AgentRunsService.decide`), nunca como uma exceção que
   * deixaria o estado da aprovação inconsistente.
   */
  async applyApprovedWrite(input: ApplyApprovedWriteInput): Promise<ApplyApprovedWriteResult> {
    const { repositoryId, repositoryName, proposedPath, proposedPatch } = input;

    if (typeof proposedPath !== 'string' || proposedPath.length === 0 || typeof proposedPatch !== 'string') {
      return {
        ok: false,
        result: { error: 'Patch simulado ausente ou em formato inválido — nada para aplicar de verdade.' },
      };
    }

    let root: string;
    let absoluteTarget: string;
    try {
      root = await this.ensureWorkspaceCopy(repositoryId, repositoryName);
      absoluteTarget = resolveInsideWorkspace(root, proposedPath);
    } catch (error) {
      return {
        ok: false,
        result: {
          error: error instanceof Error ? error.message : 'Falha ao preparar o workspace isolado.',
          path: proposedPath,
        },
      };
    }

    let currentContent: string;
    let fileExistedBefore: boolean;
    try {
      currentContent = await readFile(absoluteTarget, 'utf8');
      fileExistedBefore = true;
    } catch {
      // Arquivo ainda não existe na cópia (ex.: `apply_patch` para um
      // arquivo novo) — o patch precisa criar o conteúdo do zero.
      currentContent = '';
      fileExistedBefore = false;
    }

    const patched = applyPatch(currentContent, proposedPatch);
    if (patched === false) {
      return {
        ok: false,
        result: {
          error:
            'O patch aprovado não aplicou de forma limpa sobre o conteúdo atual do arquivo na cópia isolada do ' +
            'workspace (pode ter desalinhado se outra execução já alterou este arquivo antes).',
          path: proposedPath,
        },
      };
    }

    await mkdir(dirname(absoluteTarget), { recursive: true });
    await writeFile(absoluteTarget, patched, 'utf8');

    return {
      ok: true,
      result: {
        path: proposedPath,
        sizeBytes: Buffer.byteLength(patched, 'utf8'),
        sha256: createHash('sha256').update(patched, 'utf8').digest('hex'),
        appliedAt: new Date().toISOString(),
        note: 'Escrita real aplicada na cópia isolada do workspace — o fixture original nunca foi tocado.',
        beforeSha256: fileExistedBefore ? createHash('sha256').update(currentContent, 'utf8').digest('hex') : null,
        beforeSizeBytes: fileExistedBefore ? Buffer.byteLength(currentContent, 'utf8') : null,
        fileExistedBefore,
      },
    };
  }
}
