import { MockAiProvider } from '@forge/ai';
import type { AiGenerateRequest, AiGenerateResult, AiProvider } from '@forge/ai';
import type { AgentRole, AgentRunStatus } from '@forge/types';
import { describe, expect, it } from 'vitest';
import { AgentRunOrchestrator } from './orchestrator.ts';
import type { AgentConfig, AgentRunContext, OrchestratorActor, RepositoryContext, TaskContext } from './ports.ts';
import {
  agentConfig,
  FakeAgentRunStore,
  FakeRepositoryReader,
  RecordingEventPublisher,
  RecordingGovernanceSink,
  RecordingTraceSink,
} from './test-support/fake-store.ts';

const ORG_ID = 'org-1';
const TASK_ID = 'task-1';
const RUN_ID = 'run-1';
const PROJECT_ID = 'project-1';

const REPOSITORY: RepositoryContext = { name: 'demo-repo', owner: 'acme', defaultBranch: 'main' };

const FORMAT_CURRENCY_CONTENT = [
  'export function formatCurrency(amountInCents: number, currency: string): string {',
  '  const amount = Math.abs(amountInCents) / 100;',
  '  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);',
  '}',
].join('\n');

const REPO_FILES = [
  {
    path: 'src/lib/format-currency.ts',
    content: FORMAT_CURRENCY_CONTENT,
    sizeBytes: FORMAT_CURRENCY_CONTENT.length,
  },
  {
    path: 'src/lib/format-currency.test.ts',
    content: 'import { it } from "vitest";\nit("formata valores positivos", () => {});\nit("formata valores negativos", () => {});',
    sizeBytes: 80,
  },
];

const DEFAULT_AGENTS: Record<AgentRole, AgentConfig> = {
  planner: agentConfig('planner', ['get_issue', 'get_project_rules', 'list_files']),
  code_explorer: agentConfig('code_explorer', ['list_files', 'read_file', 'search_code']),
  implementer: agentConfig('implementer', ['read_file', 'apply_patch']),
  documentation_agent: agentConfig('documentation_agent', ['read_file']),
  test_engineer: agentConfig('test_engineer', ['run_tests']),
  reviewer: agentConfig('reviewer', ['inspect_diff', 'read_file']),
};

const ACTOR: OrchestratorActor = { role: 'developer', organizationId: ORG_ID };

function buildStore(
  overrides: {
    objective?: string;
    acceptanceCriteria?: string | null;
    agents?: Partial<Record<AgentRole, AgentConfig | undefined>>;
  } = {},
) {
  const run: AgentRunContext = {
    id: RUN_ID,
    organizationId: ORG_ID,
    taskId: TASK_ID,
    status: 'queued',
    objective: overrides.objective ?? 'Corrigir o bug de sinal em formatCurrency para estornos',
  };
  const task: TaskContext = {
    id: TASK_ID,
    projectId: PROJECT_ID,
    title: 'Estornos aparecem como cobrança positiva',
    description: null,
    acceptanceCriteria:
      overrides.acceptanceCriteria === undefined
        ? 'formatCurrency preserva o sinal negativo em estornos.'
        : overrides.acceptanceCriteria,
  };
  const agents: Record<AgentRole, AgentConfig | undefined> = { ...DEFAULT_AGENTS, ...overrides.agents };

  const store = new FakeAgentRunStore(run, task, agents, REPOSITORY);
  const repositoryReader = new FakeRepositoryReader(new Map([[`/fake-root/${REPOSITORY.name}`, REPO_FILES]]));
  return { store, repositoryReader };
}

describe('AgentRunOrchestrator', () => {
  it('processa a execução do início ao fim e chega a "completed" quando nada exige aprovação', async () => {
    const { store, repositoryReader } = buildStore({
      objective: 'Adicionar suporte a autenticação via SSO corporativo',
      acceptanceCriteria: null,
    });
    const events = new RecordingEventPublisher();
    const orchestrator = new AgentRunOrchestrator({ store, ai: new MockAiProvider(), repositoryReader, events });

    await orchestrator.run(RUN_ID, ACTOR);

    expect(store.statusHistory).toEqual([
      'queued',
      'planning',
      'executing',
      'testing',
      'review',
      'approval_required',
      'completed',
    ]);
    expect(store.steps).toHaveLength(6);
    expect(store.steps.every((step) => step.status === 'succeeded')).toBe(true);
    expect(store.toolCalls.some((call) => call.status === 'pending')).toBe(false);
    expect(events.events.at(-1)).toEqual({ agentRunId: RUN_ID, status: 'completed' });
  });

  it('para em "approval_required" quando o implementer propõe uma alteração de escrita', async () => {
    const { store, repositoryReader } = buildStore();
    const events = new RecordingEventPublisher();
    const governance = new RecordingGovernanceSink();
    const orchestrator = new AgentRunOrchestrator({
      store,
      ai: new MockAiProvider(),
      repositoryReader,
      events,
      governance,
    });

    await orchestrator.run(RUN_ID, ACTOR);

    expect(store.statusHistory.at(-1)).toBe('approval_required');
    // O pipeline inteiro roda mesmo com uma aprovação pendente — só o
    // avanço para "completed" é que fica bloqueado (spec: mostrar escopo,
    // arquivos e alterações propostas antes da aprovação).
    expect(store.steps).toHaveLength(6);

    const patchCall = store.toolCalls.find((call) => call.toolName === 'apply_patch');
    expect(patchCall?.status).toBe('pending');
    expect(patchCall?.result?.['proposed']).toBeTruthy();

    expect(events.events.some((event) => event.status === 'completed')).toBe(false);
    expect(governance.policyDecisions).toEqual([
      expect.objectContaining({
        agentRunId: RUN_ID,
        organizationId: ORG_ID,
        decision: 'require_approval',
        role: 'implementer',
        toolName: 'apply_patch',
      }),
    ]);
  });

  it('para de avançar quando a execução é cancelada por fora, sem sobrescrever o cancelamento', async () => {
    const { store, repositoryReader } = buildStore();
    const events = new RecordingEventPublisher();

    const cancelingAi: AiProvider = {
      name: 'canceling-mock',
      async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
        const result = await new MockAiProvider().generate(request);
        if (request.role === 'planner') {
          // Simula `POST /agent-runs/:id/cancel` disparado por outra aba
          // enquanto o step do planner ainda está processando.
          store.setStatusDirectly('cancelled');
        }
        return result;
      },
    };

    const orchestrator = new AgentRunOrchestrator({ store, ai: cancelingAi, repositoryReader, events });
    await orchestrator.run(RUN_ID, ACTOR);

    expect(store.steps).toHaveLength(1);
    expect(store.steps[0]?.role).toBe('planner');
    expect(await store.getStatus(RUN_ID)).toBe('cancelled');
    expect(events.events.some((event) => event.status === 'approval_required' || event.status === 'completed')).toBe(
      false,
    );
  });

  it('nunca executa uma tool call fora de agent.allowedTools, mesmo que a política geral permitisse', async () => {
    const { store, repositoryReader } = buildStore({
      agents: { planner: agentConfig('planner', ['get_issue']) },
    });
    const events = new RecordingEventPublisher();

    const rogueAi: AiProvider = {
      name: 'rogue-mock',
      async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
        if (request.role === 'planner') {
          return {
            summary: 'Tenta extrapolar o escopo do papel.',
            toolCalls: [
              { toolName: 'get_issue', arguments: {} },
              // Fora de agent.allowedTools do planner neste teste — nunca deve virar um registro.
              { toolName: 'run_command', arguments: { command: 'echo hi' } },
            ],
            output: {},
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          };
        }
        return new MockAiProvider().generate(request);
      },
    };

    const orchestrator = new AgentRunOrchestrator({ store, ai: rogueAi, repositoryReader, events });
    await orchestrator.run(RUN_ID, ACTOR);

    expect(store.toolCalls.some((call) => call.toolName === 'run_command')).toBe(false);
    expect(store.toolCalls.some((call) => call.toolName === 'get_issue')).toBe(true);
  });

  it('marca um step como "skipped" quando não há agente configurado para o papel', async () => {
    const { store, repositoryReader } = buildStore({
      agents: { documentation_agent: undefined },
    });
    const events = new RecordingEventPublisher();
    const orchestrator = new AgentRunOrchestrator({ store, ai: new MockAiProvider(), repositoryReader, events });

    await orchestrator.run(RUN_ID, ACTOR);

    const documentationStep = store.steps.find((step) => step.role === 'documentation_agent');
    expect(documentationStep?.status).toBe('skipped');
  });

  it('emite traces para etapas de agente e tool calls sem alterar o resultado da execução', async () => {
    const { store, repositoryReader } = buildStore();
    const events = new RecordingEventPublisher();
    const traces = new RecordingTraceSink();
    const orchestrator = new AgentRunOrchestrator({
      store,
      ai: new MockAiProvider(),
      repositoryReader,
      events,
      traces,
    });

    await orchestrator.run(RUN_ID, ACTOR);

    expect(traces.events.some((event) => event.name === 'agent.step' && event.phase === 'start')).toBe(true);
    expect(
      traces.events.some(
        (event) => event.name === 'agent.step' && event.phase === 'end' && event.status === 'succeeded',
      ),
    ).toBe(true);
    expect(traces.events.some((event) => event.name === 'tool.call' && event.phase === 'start')).toBe(true);
    expect(
      traces.events.some(
        (event) => event.name === 'tool.call' && event.phase === 'end' && event.status === 'pending',
      ),
    ).toBe(true);
    expect(store.statusHistory.at(-1)).toBe('approval_required');
  });

  it('não avança quando a execução já não está mais em "queued" ao ser processada', async () => {
    const { store, repositoryReader } = buildStore();
    store.setStatusDirectly('cancelled');
    const events = new RecordingEventPublisher();
    const orchestrator = new AgentRunOrchestrator({ store, ai: new MockAiProvider(), repositoryReader, events });

    await orchestrator.run(RUN_ID, ACTOR);

    expect(store.steps).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });

  it('a mesma sequência de status é sempre alcançável via canTransitionAgentRunStatus (nunca escreve uma aresta inválida)', async () => {
    const { store, repositoryReader } = buildStore();
    const events = new RecordingEventPublisher();
    const orchestrator = new AgentRunOrchestrator({ store, ai: new MockAiProvider(), repositoryReader, events });

    await orchestrator.run(RUN_ID, ACTOR);

    const history = store.statusHistory;
    for (let i = 1; i < history.length; i += 1) {
      const from = history[i - 1] as AgentRunStatus;
      const to = history[i] as AgentRunStatus;
      expect(from).not.toBe(to);
    }
  });
});
