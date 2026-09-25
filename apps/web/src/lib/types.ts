import type {
  AgentRole,
  AgentRunStatus,
  AgentStepStatus,
  AIPlaygroundDatasetItem,
  AIPlaygroundEvaluationResponse,
  AIPlaygroundModel,
  DeploymentStatus,
  EnvironmentKind,
  KnowledgeSourceKind,
  MemberRole,
  PullRequestStatus,
  RepositoryProvider,
  TaskPriority,
  TaskStatus,
  TestArtifactKind,
  TestRunStatus,
  ToolCallStatus,
} from '@forge/types';

/**
 * Modelos de view local para as respostas JSON da API (Fase 4).
 *
 * Deliberadamente NÃO reusam `Project`/`Task`/`AgentRun` de `@forge/types`
 * diretamente: aqueles schemas usam `z.coerce.date()` para `createdAt`/
 * `updatedAt` (pensados para validar dados vindos do banco, onde parse via
 * `.parse()` converteria a string ISO em `Date`). O client aqui não chama
 * `.parse()` sobre a resposta HTTP (evitaria trabalho redundante de
 * validação client-side de dados que a própria API já valida) — então os
 * campos de data continuam como `string` (ISO) tal como chegam no JSON.
 * Os enums (`TaskStatus`, `TaskPriority`, `AgentRunStatus`) são unions de
 * string simples, sem coerção, por isso esses SIM são reaproveitados de
 * `@forge/types` diretamente.
 */

/**
 * Resposta de `GET /auth/me` (Fase 2) — usada aqui só para decidir se os
 * botões "Aprovar"/"Rejeitar" aparecem para o usuário logado (Fase 17). O
 * backend continua sendo a única fonte de verdade de autorização (`
 * RequirePermission('agent_run:approve')`); esconder o botão de quem não
 * tem a permissão é UX, não segurança.
 */
export interface ApiCurrentUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: MemberRole;
}

export interface ApiTechProfile {
  languages: string[];
  frameworks: string[];
  packageManager: string | null;
}

export interface ApiProject {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  techProfile: ApiTechProfile;
  architectureNotes: string | null;
  codeRules: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  dependsOnTask: {
    id: string;
    title: string;
    status: TaskStatus;
  };
}

export interface ApiTask {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  priority: TaskPriority;
  labels: string[];
  assigneeId: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  dependencies: ApiTaskDependency[];
}

export interface ApiDeploymentSummary {
  id: string;
  organizationId: string;
  environmentId: string;
  projectId: string;
  pullRequestId: string | null;
  commitSha: string;
  status: DeploymentStatus;
  startedAt: string | null;
  completedAt: string | null;
  deployedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deployedByUser: { id: string; name: string; email: string } | null;
  pullRequest: { id: string; externalNumber: number | null; title: string; externalUrl: string | null } | null;
  latestApproval: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    requestedByUserId: string | null;
    approvedByUserId: string | null;
    reason: string | null;
    decidedAt: string | null;
    createdAt: string;
  } | null;
}

export interface ApiEnvironment {
  id: string;
  organizationId: string;
  projectId: string;
  kind: EnvironmentKind;
  name: string;
  url: string | null;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
  deployments: ApiDeploymentSummary[];
}

export interface ApiAgentRun {
  id: string;
  organizationId: string;
  taskId: string;
  agentId: string;
  workspaceId: string | null;
  status: AgentRunStatus;
  objective: string;
  scope: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  totalTokens: number;
  totalCostUsd: string;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Modelos de view da Fase 5 (`CodeModule` — spec §10 "Inteligência de
 * código"). Mesma regra de `ApiProject`/`ApiTask` acima: espelham a
 * resposta JSON tal como o backend já valida, sem reparse client-side.
 */
export interface ApiTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: ApiTreeNode[];
}

export type ApiCodeSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 're-export';

export interface ApiCodeSymbol {
  name: string;
  kind: ApiCodeSymbolKind;
  line: number;
}

export interface ApiFileContent {
  path: string;
  content: string;
  sizeBytes: number;
  language: string;
  symbols: ApiCodeSymbol[] | null;
}

export interface ApiSearchResult {
  path: string;
  matchedInName: boolean;
  matchedInContent: boolean;
  snippet: string | null;
}

export interface ApiDiffEntry {
  id: string;
  filePath: string;
  changeType: string;
  patch: string;
  additions: number;
  deletions: number;
  beforeSizeBytes: number | null;
  afterSizeBytes: number | null;
  createdAt: string;
}

export interface ApiKnowledgeSourceSummary {
  id: string;
  organizationId: string;
  projectId: string | null;
  workspaceId: string | null;
  kind: KnowledgeSourceKind;
  title: string;
  uri: string;
  version: string | null;
  chunkCount: number;
  totalTokens: number;
  riskyChunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKnowledgeSearchResult {
  sourceId: string;
  title: string;
  uri: string;
  kind: KnowledgeSourceKind;
  projectId: string | null;
  workspaceId: string | null;
  content: string;
  wrappedContent: string;
  chunkIndex: number;
  score: number;
  hasPromptInjectionRisk: boolean;
}

/**
 * Modelos de view da Fase 6 (`AgentRunsModule`/`ArtifactsModule` — spec §9
 * "Modelo de execução"). Mesma regra das interfaces acima: espelham a
 * resposta JSON tal como o backend já valida/tenant-scopa, sem reparse
 * client-side. `input`/`output`/`arguments`/`result` continuam
 * `Record<string, unknown>` (jsonb livre no schema — spec §16); a leitura
 * estruturada de campos específicos (ex.: os `findings` do `reviewer`) é
 * feita sob demanda com um parser defensivo, nunca com um cast direto (ver
 * `reviewer-findings.ts`).
 */
export interface ApiToolCall {
  id: string;
  agentStepId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown> | null;
  status: ToolCallStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ApiAiUsage {
  id: string;
  organizationId: string;
  agentRunId: string | null;
  agentStepId: string | null;
  aiMessageId: string | null;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: string;
  createdAt: string;
}

export interface ApiAgentStep {
  id: string;
  agentRunId: string;
  name: string;
  role: AgentRole;
  status: AgentStepStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  tokens: number;
  costUsd: string;
  createdAt: string;
  toolCalls: ApiToolCall[];
  usages: ApiAiUsage[];
}

export interface ApiAgentRunDetail extends ApiAgentRun {
  steps: ApiAgentStep[];
  testRuns: ApiTestRun[];
  pullRequests: ApiPullRequest[];
}

/**
 * PR real aberto via `MockGitProvider` (Fase 10 continuação) quando uma
 * execução aprovada aplica pelo menos uma escrita real (Fase 18) contra um
 * repositório configurado. Incluído no mesmo `GET /agent-runs/:id` já
 * existente — pode não existir (`pullRequests: []`), ex.: nenhuma escrita
 * aplicou de verdade, ou o projeto não tem repositório configurado.
 */
export interface ApiPullRequest {
  id: string;
  organizationId: string;
  projectId: string;
  repositoryId: string;
  workspaceId: string | null;
  taskId: string | null;
  agentRunId: string | null;
  provider: RepositoryProvider;
  externalNumber: number | null;
  externalUrl: string | null;
  title: string;
  description: string | null;
  sourceBranch: string;
  targetBranch: string;
  status: PullRequestStatus;
  mergedAt: string | null;
  createdAt: string;
}

/**
 * Resultado real de `run_tests` persistido (Fase 9 continuação): quando o
 * step `test_engineer` chama `run_tests` de verdade contra o fixture (ver
 * `packages/agents/src/real-tool-runner.ts`), o resultado agora também vira
 * uma linha em `test_runs`/`test_suites`, incluída aqui no mesmo `GET
 * /agent-runs/:id` já existente. Pode não existir (`testRuns: []`) — ex.:
 * projeto sem repositório configurado, ou nenhum arquivo `.test.ts`
 * encontrado.
 */
export interface ApiTestSuite {
  id: string;
  testRunId: string;
  name: string;
  status: TestRunStatus;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  durationMs: number | null;
  isFlaky: boolean;
  createdAt: string;
}

export interface ApiTestRun {
  id: string;
  organizationId: string;
  projectId: string;
  workspaceId: string | null;
  agentRunId: string | null;
  triggeredByUserId: string | null;
  status: TestRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  suites: ApiTestSuite[];
  artifacts: ApiTestArtifact[];
}

export interface ApiTestArtifact {
  id: string;
  testRunId: string;
  testSuiteId: string | null;
  kind: TestArtifactKind;
  name: string;
  storageKey: string;
  sizeBytes: number | null;
  createdAt: string;
}

export interface ApiArtifactContent {
  id: string;
  name: string;
  kind: TestArtifactKind;
  content: string;
  sizeBytes: number;
}

export interface ApiAIPlaygroundConfig {
  models: AIPlaygroundModel[];
  defaultDataset: AIPlaygroundDatasetItem[];
}

export type ApiAIPlaygroundEvaluation = AIPlaygroundEvaluationResponse;

export interface ApiAuditLog {
  id: string;
  organizationId: string;
  actorType: 'user' | 'agent' | 'system';
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorUser: { id: string; name: string; email: string; role: string } | null;
}
