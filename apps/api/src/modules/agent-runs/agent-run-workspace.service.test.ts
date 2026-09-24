import { createHash } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURES_ROOT } from '../../infrastructure/repository-fs/repository-fs.service.js';
import { AgentRunWorkspaceService, WORKSPACES_ROOT } from './agent-run-workspace.service.js';

const REPOSITORY_NAME = 'acme-platform-web';
const TARGET_RELATIVE_PATH = 'src/lib/format-currency.ts';
const FIXTURE_TARGET_ABSOLUTE_PATH = join(FIXTURES_ROOT, REPOSITORY_NAME, TARGET_RELATIVE_PATH);

async function fileHash(path: string): Promise<string> {
  const content = await readFile(path, 'utf8');
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Testes reais (fs de verdade, sem mocks) do serviço que conecta execução
 * real, limitada, atrás da aprovação humana (spec §18): copia
 * `fixtures/acme-platform-web` para uma cópia isolada e descartável em
 * `.data/workspaces/<repositoryId>/` e aplica patches de verdade nela — o
 * núcleo da tarefa é provar duas coisas com evidência real, não com
 * autorrelato: (1) o arquivo muda de verdade na cópia; (2)
 * `fixtures/acme-platform-web/` original NUNCA é tocado, em nenhum caminho
 * (sucesso, falha de patch, ou tentativa de path traversal).
 */
describe('AgentRunWorkspaceService', () => {
  const createdRepositoryIds: string[] = [];

  afterEach(async () => {
    for (const id of createdRepositoryIds.splice(0)) {
      await rm(join(WORKSPACES_ROOT, id), { recursive: true, force: true });
    }
  });

  function freshRepositoryId(suffix: string): string {
    const id = `test-repo-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    createdRepositoryIds.push(id);
    return id;
  }

  it('copia o fixture para a cópia isolada na primeira escrita e aplica o patch de verdade', async () => {
    const originalHashBefore = await fileHash(FIXTURE_TARGET_ABSOLUTE_PATH);
    const originalContent = await readFile(FIXTURE_TARGET_ABSOLUTE_PATH, 'utf8');
    const [firstLine] = originalContent.split('\n');

    const service = new AgentRunWorkspaceService();
    const repositoryId = freshRepositoryId('success');

    const patch = [
      `--- a/${TARGET_RELATIVE_PATH}`,
      `+++ b/${TARGET_RELATIVE_PATH}`,
      '@@ -1,1 +1,2 @@',
      ` ${firstLine ?? ''}`,
      '+// Forge: escrita real de teste (agent-run-workspace.service.test.ts)',
    ].join('\n');

    const outcome = await service.applyApprovedWrite({
      repositoryId,
      repositoryName: REPOSITORY_NAME,
      proposedPath: TARGET_RELATIVE_PATH,
      proposedPatch: patch,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error('esperado sucesso');
    expect(outcome.result.path).toBe(TARGET_RELATIVE_PATH);
    expect(typeof outcome.result.sha256).toBe('string');

    const writtenPath = join(WORKSPACES_ROOT, repositoryId, TARGET_RELATIVE_PATH);
    const writtenContent = await readFile(writtenPath, 'utf8');
    expect(writtenContent).toContain('// Forge: escrita real de teste (agent-run-workspace.service.test.ts)');
    expect(writtenContent).not.toBe(originalContent);
    expect(outcome.result.sha256).toBe(createHash('sha256').update(writtenContent, 'utf8').digest('hex'));
    expect(outcome.result.sizeBytes).toBe(Buffer.byteLength(writtenContent, 'utf8'));

    // O arquivo ORIGINAL do fixture nunca foi tocado — mesmo hash de antes.
    const originalHashAfter = await fileHash(FIXTURE_TARGET_ABSOLUTE_PATH);
    expect(originalHashAfter).toBe(originalHashBefore);
    const originalContentAfter = await readFile(FIXTURE_TARGET_ABSOLUTE_PATH, 'utf8');
    expect(originalContentAfter).toBe(originalContent);
  });

  it('reaproveita a cópia já existente em escritas seguintes (não recopia, preserva o que já foi escrito)', async () => {
    const service = new AgentRunWorkspaceService();
    const repositoryId = freshRepositoryId('reuse');

    const root = await service.ensureWorkspaceCopy(repositoryId, REPOSITORY_NAME);
    const marker = join(root, 'FORGE_TEST_MARKER.txt');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(marker, 'marcador da primeira cópia', 'utf8');

    const rootAgain = await service.ensureWorkspaceCopy(repositoryId, REPOSITORY_NAME);
    expect(rootAgain).toBe(root);

    const markerStillThere = await stat(marker)
      .then(() => true)
      .catch(() => false);
    expect(markerStillThere).toBe(true);
  });

  it('retorna erro real (não aplica nada) quando o patch não bate com o conteúdo atual do arquivo', async () => {
    const service = new AgentRunWorkspaceService();
    const repositoryId = freshRepositoryId('bad-patch');

    const patch = [
      `--- a/${TARGET_RELATIVE_PATH}`,
      `+++ b/${TARGET_RELATIVE_PATH}`,
      '@@ -1,1 +1,2 @@',
      ' ESTA_LINHA_NAO_EXISTE_NO_ARQUIVO_DE_VERDADE_XYZ',
      '+// nunca deveria aplicar',
    ].join('\n');

    const outcome = await service.applyApprovedWrite({
      repositoryId,
      repositoryName: REPOSITORY_NAME,
      proposedPath: TARGET_RELATIVE_PATH,
      proposedPatch: patch,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('esperado erro');
    expect(outcome.result.error).toMatch(/não aplicou de forma limpa/);

    // A cópia foi criada (para poder ler o conteúdo atual), mas o arquivo
    // alvo continua com o conteúdo original do fixture — nada foi escrito.
    const copiedContent = await readFile(join(WORKSPACES_ROOT, repositoryId, TARGET_RELATIVE_PATH), 'utf8');
    const originalContent = await readFile(FIXTURE_TARGET_ABSOLUTE_PATH, 'utf8');
    expect(copiedContent).toBe(originalContent);
  });

  it('rejeita um caminho proposto que tenta escapar do workspace isolado (path traversal) sem criar nada fora dele', async () => {
    const service = new AgentRunWorkspaceService();
    const repositoryId = freshRepositoryId('traversal');

    const outcome = await service.applyApprovedWrite({
      repositoryId,
      repositoryName: REPOSITORY_NAME,
      proposedPath: '../../../../etc/passwd',
      proposedPatch: '--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b\n',
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('esperado erro');
    expect(outcome.result.error).toMatch(/fora do workspace/);

    // `resolveInsideWorkspace` lança ANTES de qualquer leitura/escrita do
    // caminho malicioso (ver `packages/sandbox/src/path-policy.ts`) — a
    // única coisa criada em disco é a cópia legítima do fixture, e nada com
    // o nome do alvo malicioso existe nela.
    const maliciousFileInsideCopy = await stat(join(WORKSPACES_ROOT, repositoryId, 'etc', 'passwd'))
      .then(() => true)
      .catch(() => false);
    expect(maliciousFileInsideCopy).toBe(false);
  });

  it('trata patch simulado ausente/inválido como erro real, sem lançar exceção', async () => {
    const service = new AgentRunWorkspaceService();
    const repositoryId = freshRepositoryId('missing-patch');

    const outcome = await service.applyApprovedWrite({
      repositoryId,
      repositoryName: REPOSITORY_NAME,
      proposedPath: TARGET_RELATIVE_PATH,
      proposedPatch: undefined,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('esperado erro');
    expect(outcome.result.error).toMatch(/ausente ou em formato inválido/);
  });
});
