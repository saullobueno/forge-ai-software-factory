export interface GitRepositoryRef {
  owner: string;
  name: string;
}

export interface GitBranch {
  name: string;
  commitSha: string;
  protected: boolean;
}

export interface GitCommit {
  sha: string;
  message: string;
  authorName: string;
  authoredAt: Date;
  parentShas: readonly string[];
}

export interface GitDiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface GitDiff {
  baseSha: string;
  headSha: string;
  files: readonly GitDiffFile[];
}

export interface GitCheckRun {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | null;
  detailsUrl: string | null;
}

export interface CreateBranchInput {
  repository: GitRepositoryRef;
  name: string;
  fromSha: string;
}

export interface CreateCommitInput {
  repository: GitRepositoryRef;
  branchName: string;
  message: string;
  files: readonly GitCommitFileChange[];
  authorName: string;
}

export interface GitCommitFileChange {
  path: string;
  content: string | null;
}

export interface CreatePullRequestInput {
  repository: GitRepositoryRef;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
}

export interface GitPullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  headBranch: string;
  baseBranch: string;
  status: 'open' | 'merged' | 'closed';
}
