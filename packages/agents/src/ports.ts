import type {
  AgentRole,
  AgentRunStatus,
  AgentStepStatus,
  AgentToolName,
  FileChangeType,
  KnowledgeSourceKind,
  MemberRole,
  TestRunStatus,
  ToolCallStatus,
} from '@forge/types';

export interface AgentRunContext {
  id: string;
  organizationId: string;
  taskId: string;
  status: AgentRunStatus;
  objective: string;
}

export interface TaskContext {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
}

export interface ProjectRulesContext {
  codeRules: string | null;
  architectureNotes: string | null;
}

export interface RepositoryContext {
  name: string;
  owner: string;
  defaultBranch: string;
}

export interface AgentKnowledgeContext {
  sourceId: string;
  title: string;
  uri: string;
  kind: KnowledgeSourceKind;
  content: string;
  wrappedContent: string;
  chunkIndex: number;
  score: number;
  hasPromptInjectionRisk: boolean;
}

export interface AgentConfig {
  id: string;
  role: AgentRole;
  isEnabled: boolean;
  allowedTools: readonly AgentToolName[];
}

export interface CreateStepInput {
  agentRunId: string;
  name: string;
  role: AgentRole;
  input: Record<string, unknown>;
}

export interface CompleteStepInput {
  status: Extract<AgentStepStatus, 'succeeded' | 'failed' | 'skipped'>;
  output: Record<string, unknown> | null;
  tokens: number;
  costUsd: number;
  durationMs: number;
}

export interface CreateToolCallInput {
  agentStepId: string;
  toolName: AgentToolName;
  arguments: Record<string, unknown>;
}

export interface CompleteToolCallInput {
  status: ToolCallStatus;
  result: Record<string, unknown> | null;
}

export interface RecordAiUsageInput {
  organizationId: string;
  agentRunId: string;
  agentStepId: string;
  provider: string;
  model: string;
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface AgentRunTraceEvent {
  name: 'agent.step' | 'tool.call';
  phase: 'start' | 'end';
  agentRunId: string;
  stepId?: string;
  toolCallId?: string;
  role?: AgentRole;
  toolName?: AgentToolName;
  status?: AgentStepStatus | ToolCallStatus;
  durationMs?: number;
  attributes?: Record<string, unknown>;
}

/**
 * Porta mínima de observabilidade (Fase 14). Mantém `@forge/agents`
 * desacoplado de Nest/OpenTelemetry: a API pode gravar logs estruturados
 * hoje e trocar por um exporter real depois, preservando o contrato.
 */
export interface AgentRunTraceSink {
  record(event: AgentRunTraceEvent): void | Promise<void>;
}

export interface AgentRunPolicyDecisionEvent {
  agentRunId: string;
  organizationId: string;
  actorUserId?: string | null;
  stepId: string;
  toolCallId: string;
  role: AgentRole;
  toolName: AgentToolName;
  decision: 'deny' | 'require_approval';
  reason: string;
}

export interface AgentRunGovernanceSink {
  recordPolicyDecision(event: AgentRunPolicyDecisionEvent): void | Promise<void>;
}

export interface AgentTestSuiteOutcome {
  name: string;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface RecordTestRunInput {
  organizationId: string;
  projectId: string;
  agentRunId: string;
  triggeredByUserId: string | null;
  /** Derivado do resultado real já computado por `executeRealTool` (ver `real-tool-runner.ts`) — nunca decidido arbitrariamente aqui. */
  status: Extract<TestRunStatus, 'passed' | 'failed'>;
  durationMs: number;
  suites: AgentTestSuiteOutcome[];
}

/**
 * Porta mínima para persistir o resultado de `run_tests` (Fase 9
 * continuação, spec §12: "execuções de testes... `test_runs`/`test_suites`").
 * `run_tests` já executa de verdade contra o fixture em disco desde a Fase 7
 * (`executeRealTool`, leitura real dos arquivos de teste — nenhum processo
 * de teste roda, ver o comentário daquele arquivo) mas até aqui o resultado
 * só existia dentro de `toolCall.result` (jsonb), nunca virava uma linha nas
 * tabelas dedicadas do schema (`packages/database/src/schema/testing.ts`,
 * já existentes desde a Fase 1). Implementada em `apps/api` por cima de
 * Drizzle — mesmo padrão de `AgentRunStore`/`AgentRunTraceSink`: `@forge/agents`
 * nunca depende de Drizzle/NestJS diretamente.
 */
export interface AgentRunTestResultSink {
  recordTestRun(input: RecordTestRunInput): Promise<void>;
}

/**
 * Uma escrita real já aplicada (`AgentRunWorkspaceService.applyApprovedWrite`,
 * Fase 18) que vai virar `file_snapshots`/`code_changes`/`diffs` reais (Fase
 * 10 continuação). `beforeContentHash`/`beforeSizeBytes` são `null` quando o
 * arquivo não existia antes (`changeType: 'created'`) — a cópia isolada do
 * workspace não tinha nada para capturar como "antes".
 */
export interface AgentRunFileChangeOutcome {
  path: string;
  changeType: Extract<FileChangeType, 'created' | 'modified'>;
  beforeContentHash: string | null;
  beforeSizeBytes: number | null;
  afterContentHash: string;
  afterSizeBytes: number;
  /** Unified diff real aplicado — o mesmo texto que `applyPatch` (jsdiff) usou, não reinventado aqui. */
  patch: string;
  additions: number;
  deletions: number;
}

export interface RecordPullRequestInput {
  organizationId: string;
  projectId: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryDefaultBranch: string;
  taskId: string;
  agentRunId: string;
  triggeredByUserId: string | null;
  /** Nome de branch determinístico — normalmente `buildFeatureBranchName(task.title)`, calculado por quem chama. */
  sourceBranch: string;
  title: string;
  description: string;
  files: readonly AgentRunFileChangeOutcome[];
}

/**
 * Porta mínima para persistir a abertura de um PR real via `MockGitProvider`
 * (Fase 10 continuação, spec §10/§19: "operações Git reais... `pull_requests`/
 * `code_changes`/`diffs`/`file_snapshots`"), mesmo padrão de
 * `AgentRunTestResultSink`: `@forge/agents` só conhece o contrato mínimo,
 * nunca Drizzle/`@forge/git` diretamente.
 *
 * **Diferença deliberada de `AgentRunTestResultSink`/`AgentRunOrchestratorDeps`**:
 * esta porta NÃO é injetada em `AgentRunOrchestratorDeps` nem chamada de
 * dentro de `AgentRunOrchestrator.run()`. `run_tests` executa de verdade
 * durante o pipeline inicial (ferramenta `allow`, nunca exige aprovação) —
 * por isso `recordTestRun` é chamado de dentro do orquestrador, no mesmo
 * fluxo. Já `write_file`/`apply_patch`/`create_commit`/`create_pull_request`
 * são SEMPRE `require_approval` (`packages/domain/src/tool-policy.ts`):
 * nenhuma delas executa de verdade durante `run()` — a execução real só
 * acontece depois, em `AgentRunsService.decide()` (`apps/api`), exatamente
 * como a escrita real de arquivo já funciona desde a Fase 18
 * (`AgentRunWorkspaceService`). Consequentemente, abrir um PR real também só
 * pode acontecer ali, nunca no orquestrador — o tipo desta porta vive em
 * `packages/agents` só para reuso/consistência de contrato (mesmo raciocínio
 * de `RepositoryReader`/`AgentRunEventPublisher`: tipagem estrutural
 * compartilhada, implementação 100% em `apps/api`).
 */
export interface AgentRunGitSink {
  recordPullRequest(input: RecordPullRequestInput): Promise<{ id: string } | null>;
}

/**
 * Porta de acesso a dados usada pelo orquestrador (Fase 7). Implementada em
 * `apps/api` por cima de Drizzle/Postgres (ver
 * `apps/api/src/modules/agent-runs/agent-run-orchestration.store.ts`) —
 * este pacote nunca depende de NestJS/Drizzle diretamente, o que o mantém
 * testável com um fake em memória (ver `orchestrator.test.ts`).
 */
export interface AgentRunStore {
  getAgentRun(agentRunId: string): Promise<AgentRunContext | undefined>;
  /** Leitura fresca do status — usada para detectar cancelamento concorrente entre steps. */
  getStatus(agentRunId: string): Promise<AgentRunStatus | undefined>;
  getTask(taskId: string, organizationId: string): Promise<TaskContext | undefined>;
  getProjectRules(projectId: string, organizationId: string): Promise<ProjectRulesContext | undefined>;
  getRepositoryForProject(projectId: string, organizationId: string): Promise<RepositoryContext | undefined>;
  getKnowledgeContext(projectId: string, organizationId: string, query: string, limit: number): Promise<AgentKnowledgeContext[]>;
  getAgentByRole(organizationId: string, role: AgentRole): Promise<AgentConfig | undefined>;
  /** Persiste a transição — quem chama (`AgentRunOrchestrator`) já validou via `@forge/domain` antes de chamar isto. */
  setStatus(agentRunId: string, status: AgentRunStatus): Promise<void>;
  createStep(input: CreateStepInput): Promise<{ id: string }>;
  completeStep(stepId: string, update: CompleteStepInput): Promise<void>;
  createToolCall(input: CreateToolCallInput): Promise<{ id: string }>;
  completeToolCall(toolCallId: string, update: CompleteToolCallInput): Promise<void>;
  recordAiUsage(input: RecordAiUsageInput): Promise<void>;
  accumulateUsage(agentRunId: string, tokens: number, costUsd: number): Promise<void>;
}

export interface RepositoryFileContent {
  path: string;
  content: string;
  sizeBytes: number;
}

export interface RepositoryTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: RepositoryTreeNode[];
}

/**
 * Porta de leitura do repositório demo em disco — estruturalmente idêntica
 * a `RepositoryFsService` (`apps/api/src/infrastructure/repository-fs/`),
 * de propósito: a instância real do serviço Nest satisfaz esta interface
 * sem nenhum adaptador (tipagem estrutural do TypeScript), então
 * `apps/api` injeta o mesmo `RepositoryFsService` já usado pelo
 * `CodeModule` (Fase 5) diretamente aqui, sem duplicar leitura de arquivos.
 */
export interface RepositoryReader {
  resolveRepositoryRoot(repositoryName: string): string;
  ensureRepositoryExists(root: string): Promise<void>;
  getTree(root: string): Promise<RepositoryTreeNode[]>;
  readFile(root: string, relativePath: string): Promise<RepositoryFileContent>;
  listAllFiles(root: string): Promise<RepositoryFileContent[]>;
}

/**
 * Estruturalmente idêntico a `AgentRunEventsService.publish` (Fase 6,
 * `apps/api/src/modules/agent-runs/agent-run-events.service.ts`) — a
 * mesma instância é injetada diretamente aqui, reaproveitando o canal SSE
 * já existente em vez de criar um segundo.
 */
export interface AgentRunEventPublisher {
  publish(event: { agentRunId: string; status: AgentRunStatus }): void;
}

/**
 * Identidade em nome de quem o orquestrador avalia cada tool call (spec
 * §8/§20 — toda ação de agente passa por autorização server-side). É
 * sempre o usuário que efetivamente disparou a execução (`POST
 * /tasks/:id/agent-runs`), capturado no momento da criação e propagado
 * pela fila — não um papel de "sistema" fixo, para que o RBAC real do ator
 * (spec §2) se aplique às tool calls feitas em nome dele.
 */
export interface OrchestratorActor {
  role: MemberRole;
  organizationId: string;
  userId?: string;
}
