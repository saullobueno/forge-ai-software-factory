import type { GitProvider } from './git-provider.ts';
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

export interface GitHubGitClient {
  getDefaultBranch(repository: GitRepositoryRef): Promise<GitBranch>;
  listBranches(repository: GitRepositoryRef): Promise<readonly GitBranch[]>;
  getCommit(repository: GitRepositoryRef, sha: string): Promise<GitCommit>;
  getDiff(repository: GitRepositoryRef, baseSha: string, headSha: string): Promise<GitDiff>;
  createBranch(input: CreateBranchInput): Promise<GitBranch>;
  createCommit(input: CreateCommitInput): Promise<GitCommit>;
  createPullRequest(input: CreatePullRequestInput): Promise<GitPullRequest>;
  listChecks(repository: GitRepositoryRef, sha: string): Promise<readonly GitCheckRun[]>;
}

/**
 * Fronteira GitHub sem dependência em SDK específico. A implementação real
 * pode injetar Octokit, app installation tokens ou outro cliente, mantendo
 * o restante do Forge preso ao contrato `GitProvider`.
 */
export class GitHubGitProvider implements GitProvider {
  private readonly client: GitHubGitClient;

  constructor(client: GitHubGitClient) {
    this.client = client;
  }

  async getDefaultBranch(repository: GitRepositoryRef): Promise<GitBranch> {
    return await this.client.getDefaultBranch(repository);
  }

  async listBranches(repository: GitRepositoryRef): Promise<readonly GitBranch[]> {
    return await this.client.listBranches(repository);
  }

  async getCommit(repository: GitRepositoryRef, sha: string): Promise<GitCommit> {
    return await this.client.getCommit(repository, sha);
  }

  async getDiff(repository: GitRepositoryRef, baseSha: string, headSha: string): Promise<GitDiff> {
    return await this.client.getDiff(repository, baseSha, headSha);
  }

  async createBranch(input: CreateBranchInput): Promise<GitBranch> {
    return await this.client.createBranch(input);
  }

  async createCommit(input: CreateCommitInput): Promise<GitCommit> {
    return await this.client.createCommit(input);
  }

  async createPullRequest(input: CreatePullRequestInput): Promise<GitPullRequest> {
    return await this.client.createPullRequest(input);
  }

  async listChecks(repository: GitRepositoryRef, sha: string): Promise<readonly GitCheckRun[]> {
    return await this.client.listChecks(repository, sha);
  }
}
