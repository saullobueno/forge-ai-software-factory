import { Injectable } from '@nestjs/common';
import type { AgentRunGitSink, RecordPullRequestInput } from '@forge/agents';
import { MockGitProvider, type GitRepositoryRef, type MockGitRepository } from '@forge/git';
import { AgentRunGitRepository } from './agent-run-git.repository.js';
import { AgentRunWorkspaceService } from './agent-run-workspace.service.js';

/**
 * Conecta `@forge/git` (Fase 10, até aqui isolado — nada em `apps/api`
 * chamava `MockGitProvider`) à persistência real (Fase 10 continuação):
 * quando uma execução aprovada tem pelo menos uma escrita real aplicada
 * (`AgentRunWorkspaceService`, Fase 18) sobre um repositório com
 * `provider: 'mock'`, este serviço abre branch+commit+PR de verdade DENTRO
 * do `MockGitProvider` (sem nenhuma chamada de rede — `GitHubGitProvider`
 * continua fora de escopo, mesma fronteira já documentada desde a Fase 10) e
 * grava o resultado em `workspaces`/`file_snapshots`/`code_changes`/`diffs`/
 * `pull_requests` — as mesmas tabelas que o seed da Fase 3 já povoa para o
 * PR de demonstração estático (`packages/database/src/seed/run-seed.ts`),
 * seguido aqui como referência de shape.
 *
 * Implementa `AgentRunGitSink` (`@forge/agents`) mas — ver o comentário
 * daquela interface — NUNCA é injetado em `AgentRunOrchestratorDeps`:
 * `AgentRunsService.decide()` chama este serviço diretamente, depois de
 * `AgentRunWorkspaceService.applyApprovedWrite` já ter escrito de verdade,
 * exatamente como a Fase 18 já fazia para a escrita de arquivo em si.
 */
@Injectable()
export class AgentRunGitService implements AgentRunGitSink {
  /**
   * Um `MockGitProvider` por repositório, reaproveitado entre chamadas
   * (singleton do Nest) — para que aprovações sucessivas sobre o MESMO
   * repositório acumulem histórico real dentro do processo (branches,
   * commits, números de PR incrementando), em vez de reiniciar do zero a
   * cada chamada. Mesmo raciocínio de persistência "durante a vida do
   * processo" já usado pela cópia em disco de `AgentRunWorkspaceService`
   * (`.data/workspaces/<repositoryId>/`) — os dois são reinicializados
   * juntos quando a API reinicia, o que é aceitável para um provider mock de
   * demonstração (nunca uma fonte de verdade externa).
   */
  private readonly providers = new Map<string, MockGitProvider>();

  constructor(
    private readonly repository: AgentRunGitRepository,
    private readonly workspace: AgentRunWorkspaceService,
  ) {}

  async recordPullRequest(input: RecordPullRequestInput): Promise<{ id: string } | null> {
    if (input.files.length === 0) return null;

    const ref: GitRepositoryRef = { owner: input.repositoryOwner, name: input.repositoryName };
    const provider = this.getOrCreateProvider(input.repositoryId, ref, input.repositoryDefaultBranch);

    const defaultBranch = await provider.getDefaultBranch(ref);
    const existingBranches = await provider.listBranches(ref);
    if (!existingBranches.some((branch) => branch.name === input.sourceBranch)) {
      await provider.createBranch({ repository: ref, name: input.sourceBranch, fromSha: defaultBranch.commitSha });
    }

    await provider.createCommit({
      repository: ref,
      branchName: input.sourceBranch,
      message: input.title,
      authorName: 'Forge Agent',
      files: input.files.map((file) => ({ path: file.path, content: file.patch })),
    });

    const pullRequest = await provider.createPullRequest({
      repository: ref,
      title: input.title,
      body: input.description,
      headBranch: input.sourceBranch,
      baseBranch: input.repositoryDefaultBranch,
    });

    const workspaceRow = await this.repository.createWorkspace({
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositoryId: input.repositoryId,
      taskId: input.taskId,
      branchName: input.sourceBranch,
      // Caminho real da cópia isolada em disco (Fase 18) — não um worktree
      // git literal, mas é o diretório real onde as escritas desta execução
      // de fato aconteceram, então é mais honesto do que inventar um
      // caminho fictício.
      worktreePath: this.workspace.workspaceRoot(input.repositoryId),
    });

    const capturedAt = new Date();
    for (const file of input.files) {
      const beforeSnapshot =
        file.beforeContentHash !== null && file.beforeSizeBytes !== null
          ? await this.repository.createFileSnapshot({
              organizationId: input.organizationId,
              workspaceId: workspaceRow.id,
              path: file.path,
              contentHash: file.beforeContentHash,
              sizeBytes: file.beforeSizeBytes,
              capturedAt,
            })
          : null;

      const afterSnapshot = await this.repository.createFileSnapshot({
        organizationId: input.organizationId,
        workspaceId: workspaceRow.id,
        path: file.path,
        contentHash: file.afterContentHash,
        sizeBytes: file.afterSizeBytes,
        capturedAt,
      });

      const codeChange = await this.repository.createCodeChange({
        organizationId: input.organizationId,
        workspaceId: workspaceRow.id,
        agentRunId: input.agentRunId,
        filePath: file.path,
        changeType: file.changeType,
        beforeSnapshotId: beforeSnapshot?.id ?? null,
        afterSnapshotId: afterSnapshot.id,
      });

      await this.repository.createDiff({
        organizationId: input.organizationId,
        codeChangeId: codeChange.id,
        patch: file.patch,
        additions: file.additions,
        deletions: file.deletions,
      });
    }

    const created = await this.repository.createPullRequest({
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositoryId: input.repositoryId,
      workspaceId: workspaceRow.id,
      taskId: input.taskId,
      agentRunId: input.agentRunId,
      provider: 'mock',
      externalNumber: pullRequest.number,
      externalUrl: pullRequest.url,
      title: input.title,
      description: input.description,
      sourceBranch: input.sourceBranch,
      targetBranch: input.repositoryDefaultBranch,
      status: pullRequest.status,
    });

    return { id: created.id };
  }

  private getOrCreateProvider(repositoryId: string, ref: GitRepositoryRef, defaultBranch: string): MockGitProvider {
    const cached = this.providers.get(repositoryId);
    if (cached) return cached;

    // sha inicial determinístico (por repositório, não por chamada) — só
    // precisa existir para `createBranch` ter um `fromSha` válido na
    // primeira vez; nunca é exposto como um commit "real" em nenhuma UI.
    const initialCommitSha = `mock-init-${repositoryId}`;
    const seed: MockGitRepository = {
      ref,
      defaultBranch,
      branches: [{ name: defaultBranch, commitSha: initialCommitSha, protected: false }],
      commits: [
        {
          sha: initialCommitSha,
          message: 'Estado inicial (mock, sem histórico real anterior a este PR).',
          authorName: 'forge-bot',
          authoredAt: new Date(0),
          parentShas: [],
        },
      ],
    };
    const created = new MockGitProvider([seed]);
    this.providers.set(repositoryId, created);
    return created;
  }
}
