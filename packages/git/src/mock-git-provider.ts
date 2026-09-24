import { GitProviderError, type GitProvider } from './git-provider.ts';
import type {
  CreateBranchInput,
  CreateCommitInput,
  CreatePullRequestInput,
  GitBranch,
  GitCheckRun,
  GitCommit,
  GitDiff,
  GitDiffFile,
  GitPullRequest,
  GitRepositoryRef,
} from './types.ts';

export interface MockGitRepository {
  ref: GitRepositoryRef;
  defaultBranch: string;
  branches: readonly GitBranch[];
  commits: readonly GitCommit[];
  diffs?: readonly GitDiff[];
  checks?: Readonly<Record<string, readonly GitCheckRun[]>>;
  pullRequests?: readonly GitPullRequest[];
}

interface MutableMockGitRepository {
  ref: GitRepositoryRef;
  defaultBranch: string;
  branches: GitBranch[];
  commits: GitCommit[];
  diffs: GitDiff[];
  checks: Map<string, readonly GitCheckRun[]>;
  pullRequests: GitPullRequest[];
}

export class MockGitProvider implements GitProvider {
  private readonly repositories = new Map<string, MutableMockGitRepository>();

  constructor(repositories: readonly MockGitRepository[]) {
    for (const repository of repositories) {
      this.repositories.set(repositoryKey(repository.ref), {
        ref: repository.ref,
        defaultBranch: repository.defaultBranch,
        branches: [...repository.branches],
        commits: [...repository.commits],
        diffs: [...(repository.diffs ?? [])],
        checks: new Map(Object.entries(repository.checks ?? {})),
        pullRequests: [...(repository.pullRequests ?? [])],
      });
    }
  }

  async getDefaultBranch(repository: GitRepositoryRef): Promise<GitBranch> {
    const repo = this.getRepository(repository);
    const branch = repo.branches.find((candidate) => candidate.name === repo.defaultBranch);
    if (!branch) throw new GitProviderError(`Branch default não encontrada: ${repo.defaultBranch}`);
    return branch;
  }

  async listBranches(repository: GitRepositoryRef): Promise<readonly GitBranch[]> {
    return [...this.getRepository(repository).branches];
  }

  async getCommit(repository: GitRepositoryRef, sha: string): Promise<GitCommit> {
    const commit = this.getRepository(repository).commits.find((candidate) => candidate.sha === sha);
    if (!commit) throw new GitProviderError(`Commit não encontrado: ${sha}`);
    return commit;
  }

  async getDiff(repository: GitRepositoryRef, baseSha: string, headSha: string): Promise<GitDiff> {
    const repo = this.getRepository(repository);
    const diff = repo.diffs.find((candidate) => candidate.baseSha === baseSha && candidate.headSha === headSha);
    if (diff) return diff;
    return {
      baseSha,
      headSha,
      files: inferDiffFiles(baseSha, headSha),
    };
  }

  async createBranch(input: CreateBranchInput): Promise<GitBranch> {
    const repo = this.getRepository(input.repository);
    if (repo.branches.some((branch) => branch.name === input.name)) {
      throw new GitProviderError(`Branch já existe: ${input.name}`);
    }
    if (!repo.commits.some((commit) => commit.sha === input.fromSha)) {
      throw new GitProviderError(`Commit base não encontrado: ${input.fromSha}`);
    }

    const branch: GitBranch = { name: input.name, commitSha: input.fromSha, protected: false };
    repo.branches.push(branch);
    return branch;
  }

  async createCommit(input: CreateCommitInput): Promise<GitCommit> {
    const repo = this.getRepository(input.repository);
    const branch = repo.branches.find((candidate) => candidate.name === input.branchName);
    if (!branch) throw new GitProviderError(`Branch não encontrada: ${input.branchName}`);

    const parentSha = branch.commitSha;
    const sha = deterministicSha(input.message, parentSha, input.files.map((file) => `${file.path}:${file.content ?? '<deleted>'}`));
    const commit: GitCommit = {
      sha,
      message: input.message,
      authorName: input.authorName,
      authoredAt: new Date(),
      parentShas: [parentSha],
    };
    repo.commits.push(commit);
    branch.commitSha = sha;
    repo.diffs.push({
      baseSha: parentSha,
      headSha: sha,
      files: input.files.map((file): GitDiffFile => ({
        path: file.path,
        status: file.content === null ? 'deleted' : 'modified',
        additions: file.content === null ? 0 : file.content.split(/\r?\n/).length,
        deletions: file.content === null ? 1 : 0,
        patch: file.content === null ? null : `@@ ${file.path}\n${file.content}`,
      })),
    });
    return commit;
  }

  async createPullRequest(input: CreatePullRequestInput): Promise<GitPullRequest> {
    const repo = this.getRepository(input.repository);
    if (!repo.branches.some((branch) => branch.name === input.headBranch)) {
      throw new GitProviderError(`Branch head não encontrada: ${input.headBranch}`);
    }
    if (!repo.branches.some((branch) => branch.name === input.baseBranch)) {
      throw new GitProviderError(`Branch base não encontrada: ${input.baseBranch}`);
    }

    const number = repo.pullRequests.length + 1;
    const pullRequest: GitPullRequest = {
      id: `mock-pr-${number}`,
      number,
      title: input.title,
      url: `https://mock.git/${repo.ref.owner}/${repo.ref.name}/pull/${number}`,
      headBranch: input.headBranch,
      baseBranch: input.baseBranch,
      status: 'open',
    };
    repo.pullRequests.push(pullRequest);
    return pullRequest;
  }

  async listChecks(repository: GitRepositoryRef, sha: string): Promise<readonly GitCheckRun[]> {
    return [...(this.getRepository(repository).checks.get(sha) ?? [])];
  }

  private getRepository(repository: GitRepositoryRef): MutableMockGitRepository {
    const repo = this.repositories.get(repositoryKey(repository));
    if (!repo) throw new GitProviderError(`Repositório não encontrado: ${repository.owner}/${repository.name}`);
    return repo;
  }
}

function repositoryKey(repository: GitRepositoryRef): string {
  return `${repository.owner}/${repository.name}`;
}

function inferDiffFiles(baseSha: string, headSha: string): readonly GitDiffFile[] {
  if (baseSha === headSha) return [];
  return [
    {
      path: 'mock/change.txt',
      status: 'modified',
      additions: 1,
      deletions: 1,
      patch: '@@ mock diff @@',
    },
  ];
}

function deterministicSha(message: string, parentSha: string, parts: readonly string[]): string {
  const input = [message, parentSha, ...parts].join('\n');
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `mock-${hash.toString(16).padStart(8, '0')}`;
}
