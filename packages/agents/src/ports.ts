import type {
  AgentRole,
  AgentRunStatus,
  AgentStepStatus,
  AgentToolName,
  MemberRole,
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
  getAgentByRole(organizationId: string, role: AgentRole): Promise<AgentConfig | undefined>;
  /** Persiste a transição — quem chama (`AgentRunOrchestrator`) já validou via `@forge/domain` antes de chamar isto. */
  setStatus(agentRunId: string, status: AgentRunStatus): Promise<void>;
  createStep(input: CreateStepInput): Promise<{ id: string }>;
  completeStep(stepId: string, update: CompleteStepInput): Promise<void>;
  createToolCall(input: CreateToolCallInput): Promise<{ id: string }>;
  completeToolCall(toolCallId: string, update: CompleteToolCallInput): Promise<void>;
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
}
