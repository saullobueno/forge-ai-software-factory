import { Injectable } from '@nestjs/common';
import { schema } from '@forge/database';
import type { FileChangeType, PullRequestStatus, RepositoryProvider } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type WorkspaceRow = typeof schema.workspaces.$inferSelect;
export type FileSnapshotRow = typeof schema.fileSnapshots.$inferSelect;
export type CodeChangeRow = typeof schema.codeChanges.$inferSelect;
export type DiffRow = typeof schema.diffs.$inferSelect;
export type PullRequestRow = typeof schema.pullRequests.$inferSelect;

export interface CreateWorkspaceInput {
  organizationId: string;
  projectId: string;
  repositoryId: string;
  taskId: string | null;
  branchName: string;
  worktreePath: string | null;
}

export interface CreateFileSnapshotInput {
  organizationId: string;
  workspaceId: string;
  path: string;
  contentHash: string;
  sizeBytes: number;
  capturedAt: Date;
}

export interface CreateCodeChangeInput {
  organizationId: string;
  workspaceId: string;
  agentRunId: string;
  filePath: string;
  changeType: FileChangeType;
  beforeSnapshotId: string | null;
  afterSnapshotId: string | null;
}

export interface CreateDiffInput {
  organizationId: string;
  codeChangeId: string;
  patch: string;
  additions: number;
  deletions: number;
}

export interface CreatePullRequestInput {
  organizationId: string;
  projectId: string;
  repositoryId: string;
  workspaceId: string;
  taskId: string;
  agentRunId: string;
  provider: RepositoryProvider;
  externalNumber: number;
  externalUrl: string;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  status: PullRequestStatus;
}

/**
 * Camada de acesso a dados para o PR real aberto via `MockGitProvider`
 * (Fase 10 continuação). Escreve nas mesmas tabelas já existentes desde a
 * Fase 1 (`packages/database/src/schema/git.ts`/`workspaces.ts`) — nenhuma
 * migração nova além da coluna `pull_requests.agent_run_id` (ver
 * `packages/database/drizzle/0002_calm_lockheed.sql`). Mesmo padrão do
 * resto do módulo (`AgentRunTestResultsRepository`): `*Repository` fino,
 * sem decisão — quem decide o shape final é `AgentRunGitService`.
 */
@Injectable()
export class AgentRunGitRepository {
  constructor(private readonly database: DatabaseService) {}

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRow> {
    const [created] = await this.database.db
      .insert(schema.workspaces)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositoryId: input.repositoryId,
        taskId: input.taskId,
        branchName: input.branchName,
        worktreePath: input.worktreePath,
        status: 'active',
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir workspace.');
    return created;
  }

  async createFileSnapshot(input: CreateFileSnapshotInput): Promise<FileSnapshotRow> {
    const [created] = await this.database.db
      .insert(schema.fileSnapshots)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        path: input.path,
        contentHash: input.contentHash,
        sizeBytes: input.sizeBytes,
        capturedAt: input.capturedAt,
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir fileSnapshot.');
    return created;
  }

  async createCodeChange(input: CreateCodeChangeInput): Promise<CodeChangeRow> {
    const [created] = await this.database.db
      .insert(schema.codeChanges)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        agentRunId: input.agentRunId,
        filePath: input.filePath,
        changeType: input.changeType,
        beforeSnapshotId: input.beforeSnapshotId,
        afterSnapshotId: input.afterSnapshotId,
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir codeChange.');
    return created;
  }

  async createDiff(input: CreateDiffInput): Promise<DiffRow> {
    const [created] = await this.database.db
      .insert(schema.diffs)
      .values({
        organizationId: input.organizationId,
        codeChangeId: input.codeChangeId,
        patch: input.patch,
        additions: input.additions,
        deletions: input.deletions,
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir diff.');
    return created;
  }

  async createPullRequest(input: CreatePullRequestInput): Promise<PullRequestRow> {
    const [created] = await this.database.db
      .insert(schema.pullRequests)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositoryId: input.repositoryId,
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        agentRunId: input.agentRunId,
        provider: input.provider,
        externalNumber: input.externalNumber,
        externalUrl: input.externalUrl,
        title: input.title,
        description: input.description,
        sourceBranch: input.sourceBranch,
        targetBranch: input.targetBranch,
        status: input.status,
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir pullRequest.');
    return created;
  }
}
