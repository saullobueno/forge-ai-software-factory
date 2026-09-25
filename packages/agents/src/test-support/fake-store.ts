import type { AgentRole, AgentRunStatus, AgentToolName } from '@forge/types';
import type {
  AgentConfig,
  AgentKnowledgeContext,
  AgentRunContext,
  AgentRunEventPublisher,
  AgentRunGovernanceSink,
  AgentRunPolicyDecisionEvent,
  AgentRunTestResultSink,
  AgentRunTraceEvent,
  AgentRunTraceSink,
  CompleteStepInput,
  CompleteToolCallInput,
  CreateStepInput,
  CreateToolCallInput,
  ProjectRulesContext,
  RecordAiUsageInput,
  RecordTestRunInput,
  RepositoryContext,
  RepositoryFileContent,
  RepositoryReader,
  RepositoryTreeNode,
  TaskContext,
} from '../ports.ts';

export interface RecordedStep extends CreateStepInput {
  id: string;
  status: 'pending' | CompleteStepInput['status'];
  output: Record<string, unknown> | null;
  tokens: number;
  costUsd: number;
  durationMs: number | null;
}

export interface RecordedToolCall extends CreateToolCallInput {
  id: string;
  status: 'pending_initial' | CompleteToolCallInput['status'];
  result: Record<string, unknown> | null;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Implementação em memória de `AgentRunStore` para testar
 * `AgentRunOrchestrator` sem banco de dados real — grava tudo em arrays
 * inspecionáveis pelos testes (`steps`, `toolCalls`, `statusHistory`).
 */
export class FakeAgentRunStore {
  readonly statusHistory: AgentRunStatus[] = [];
  readonly steps: RecordedStep[] = [];
  readonly toolCalls: RecordedToolCall[] = [];
  readonly aiUsages: RecordAiUsageInput[] = [];
  totalTokens = 0;
  totalCostUsd = 0;

  private status: AgentRunStatus;

  constructor(
    private readonly run: AgentRunContext,
    private readonly task: TaskContext,
    private readonly agentsByRole: Partial<Record<AgentRole, AgentConfig | undefined>>,
    private readonly repository: RepositoryContext | undefined,
    private readonly projectRules: ProjectRulesContext | undefined = { codeRules: null, architectureNotes: null },
    private readonly knowledgeContext: AgentKnowledgeContext[] = [],
  ) {
    this.status = run.status;
    this.statusHistory.push(run.status);
  }

  async getAgentRun(agentRunId: string): Promise<AgentRunContext | undefined> {
    if (agentRunId !== this.run.id) return undefined;
    return { ...this.run, status: this.status };
  }

  async getStatus(agentRunId: string): Promise<AgentRunStatus | undefined> {
    if (agentRunId !== this.run.id) return undefined;
    return this.status;
  }

  async getTask(taskId: string, organizationId: string): Promise<TaskContext | undefined> {
    if (taskId !== this.task.id || organizationId !== this.run.organizationId) return undefined;
    return this.task;
  }

  async getProjectRules(): Promise<ProjectRulesContext | undefined> {
    return this.projectRules;
  }

  async getRepositoryForProject(): Promise<RepositoryContext | undefined> {
    return this.repository;
  }

  async getKnowledgeContext(): Promise<AgentKnowledgeContext[]> {
    return this.knowledgeContext;
  }

  async getAgentByRole(organizationId: string, role: AgentRole): Promise<AgentConfig | undefined> {
    if (organizationId !== this.run.organizationId) return undefined;
    return this.agentsByRole[role];
  }

  /** Permite que um teste simule um cancelamento concorrente (ex.: outra aba chamando `POST /agent-runs/:id/cancel`). */
  setStatusDirectly(status: AgentRunStatus): void {
    this.status = status;
    this.statusHistory.push(status);
  }

  async setStatus(agentRunId: string, status: AgentRunStatus): Promise<void> {
    if (agentRunId !== this.run.id) throw new Error('agentRunId desconhecido');
    this.status = status;
    this.statusHistory.push(status);
  }

  async createStep(input: CreateStepInput): Promise<{ id: string }> {
    const id = nextId('step');
    this.steps.push({ ...input, id, status: 'pending', output: null, tokens: 0, costUsd: 0, durationMs: null });
    return { id };
  }

  async completeStep(stepId: string, update: CompleteStepInput): Promise<void> {
    const step = this.steps.find((candidate) => candidate.id === stepId);
    if (!step) throw new Error('step desconhecido');
    step.status = update.status;
    step.output = update.output;
    step.tokens = update.tokens;
    step.costUsd = update.costUsd;
    step.durationMs = update.durationMs;
  }

  async createToolCall(input: CreateToolCallInput): Promise<{ id: string }> {
    const id = nextId('tool-call');
    this.toolCalls.push({ ...input, id, status: 'pending_initial', result: null });
    return { id };
  }

  async completeToolCall(toolCallId: string, update: CompleteToolCallInput): Promise<void> {
    const toolCall = this.toolCalls.find((candidate) => candidate.id === toolCallId);
    if (!toolCall) throw new Error('tool call desconhecida');
    toolCall.status = update.status;
    toolCall.result = update.result;
  }

  async recordAiUsage(input: RecordAiUsageInput): Promise<void> {
    this.aiUsages.push(input);
  }

  async accumulateUsage(_agentRunId: string, tokens: number, costUsd: number): Promise<void> {
    this.totalTokens += tokens;
    this.totalCostUsd += costUsd;
  }
}

/** Implementação em memória de `RepositoryReader` — sem tocar o filesystem real. */
export class FakeRepositoryReader implements RepositoryReader {
  constructor(private readonly filesByRoot: Map<string, RepositoryFileContent[]>) {}

  resolveRepositoryRoot(repositoryName: string): string {
    return `/fake-root/${repositoryName}`;
  }

  async ensureRepositoryExists(root: string): Promise<void> {
    if (!this.filesByRoot.has(root)) throw new Error('repositório não encontrado');
  }

  async getTree(root: string): Promise<RepositoryTreeNode[]> {
    const files = this.filesByRoot.get(root) ?? [];
    return files.map((file) => ({ name: file.path, path: file.path, type: 'file' as const }));
  }

  async readFile(root: string, relativePath: string): Promise<RepositoryFileContent> {
    const files = this.filesByRoot.get(root) ?? [];
    const found = files.find((file) => file.path === relativePath);
    if (!found) throw new Error('arquivo não encontrado');
    return found;
  }

  async listAllFiles(root: string): Promise<RepositoryFileContent[]> {
    return this.filesByRoot.get(root) ?? [];
  }
}

export class RecordingEventPublisher implements AgentRunEventPublisher {
  readonly events: { agentRunId: string; status: AgentRunStatus }[] = [];

  publish(event: { agentRunId: string; status: AgentRunStatus }): void {
    this.events.push(event);
  }
}

export class RecordingTraceSink implements AgentRunTraceSink {
  readonly events: AgentRunTraceEvent[] = [];

  record(event: AgentRunTraceEvent): void {
    this.events.push(event);
  }
}

export class RecordingGovernanceSink implements AgentRunGovernanceSink {
  readonly policyDecisions: AgentRunPolicyDecisionEvent[] = [];

  recordPolicyDecision(event: AgentRunPolicyDecisionEvent): void {
    this.policyDecisions.push(event);
  }
}

export class RecordingTestResultSink implements AgentRunTestResultSink {
  readonly testRuns: RecordTestRunInput[] = [];

  async recordTestRun(input: RecordTestRunInput): Promise<void> {
    this.testRuns.push(input);
  }
}

export function agentConfig(role: AgentRole, allowedTools: AgentToolName[], isEnabled = true): AgentConfig {
  return { id: `agent-${role}`, role, isEnabled, allowedTools };
}
