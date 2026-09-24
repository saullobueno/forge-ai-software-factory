import type {
  CreateBranchInput,
  CreateCommitInput,
  CreatePullRequestInput,
  GitBranch,
  GitCheckRun,
  GitCommit,
  GitDiff,
  GitPullRequest,
  GitRepositoryRef,
} from './types.ts';

export interface GitProvider {
  getDefaultBranch(repository: GitRepositoryRef): Promise<GitBranch>;
  listBranches(repository: GitRepositoryRef): Promise<readonly GitBranch[]>;
  getCommit(repository: GitRepositoryRef, sha: string): Promise<GitCommit>;
  getDiff(repository: GitRepositoryRef, baseSha: string, headSha: string): Promise<GitDiff>;
  createBranch(input: CreateBranchInput): Promise<GitBranch>;
  createCommit(input: CreateCommitInput): Promise<GitCommit>;
  createPullRequest(input: CreatePullRequestInput): Promise<GitPullRequest>;
  listChecks(repository: GitRepositoryRef, sha: string): Promise<readonly GitCheckRun[]>;
}

export class GitProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitProviderError';
  }
}
