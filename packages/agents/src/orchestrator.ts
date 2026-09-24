import type { AiPriorStepContext, AiProvider } from '@forge/ai';
import { authorizeToolCall, transitionAgentRunStatus } from '@forge/domain';
import type { AgentRunStatus } from '@forge/types';
import { estimateCostUsd } from './cost.ts';
import { AGENT_PIPELINE } from './pipeline.ts';
import type {
  AgentRunEventPublisher,
  AgentRunGovernanceSink,
  AgentRunStore,
  AgentRunTraceEvent,
  AgentRunTraceSink,
  OrchestratorActor,
  RepositoryFileContent,
  RepositoryReader,
} from './ports.ts';
import { executeRealTool, type SimulatedPatch } from './real-tool-runner.ts';

export interface AgentRunOrchestratorDeps {
  store: AgentRunStore;
  ai: AiProvider;
  repositoryReader: RepositoryReader;
  events: AgentRunEventPublisher;
  traces?: AgentRunTraceSink;
  governance?: AgentRunGovernanceSink;
  /** Injetável para testes; por padrão o relógio real. Só afeta `durationMs` (observabilidade), nunca decisões. */
  clock?: () => Date;
}

const TERMINAL_STATUSES: ReadonlySet<AgentRunStatus> = new Set(['completed', 'failed', 'cancelled']);

/**
 * Orquestrador de execuções de agente (Fase 7, spec §8/§9): uma máquina de
 * estados explícita da aplicação, não uma cadeia de chamadas recursivas
 * sem controle. Dado um `agentRunId`, avança `AGENT_PIPELINE` do início ao
 * fim, ou para em `approval_required` (uma tool call de escrita exigiu
 * aprovação humana — Fase 11), `failed` (erro inesperado) ou o ponto em
 * que a execução foi cancelada por fora (`POST /agent-runs/:id/cancel`,
 * Fase 6).
 *
 * Regras centrais (ver `FORGE-SPECIFICATION.md` §8/§9/§18 e o comentário de
 * escopo da Fase 7):
 * - toda transição de status passa por `transitionAgentRunStatus`
 *   (`@forge/domain`) — nunca escreve um status sem validar a aresta;
 * - toda tool call passa por DOIS filtros antes de rodar: (1) precisa
 *   estar em `agent.allowedTools` do papel (escopo mínimo, spec §8) — se
 *   não estiver, nem chega a ser registrada; (2) `authorizeToolCall`
 *   (tenant + RBAC do ator + política da ferramenta);
 * - ferramentas com decisão `allow` (somente leitura/inspeção) executam de
 *   verdade contra o fixture (`executeRealTool`); decisão `require_approval`
 *   NUNCA executa de verdade — grava o resultado simulado proposto pelo
 *   provedor de IA e marca a execução para parar; decisão `deny` nunca
 *   executa;
 * - o grafo de `@forge/domain` não tem aresta `review -> completed`
 *   direta — toda execução passa por `approval_required`. Quando nenhuma
 *   tool call desta execução ficou pendente de aprovação, o orquestrador
 *   avança sozinho para `completed` (nada realmente precisava de um
 *   humano); quando alguma ficou, ele para ali de propósito.
 */
export class AgentRunOrchestrator {
  /**
   * Atribuição explícita no corpo do construtor, não uma "parameter
   * property" (`constructor(private readonly deps: ...)`) — `apps/api`
   * roda como processo Node real via `node dist/main.js`/`nest start`
   * contra o TypeScript nativo do Node em modo "strip-only" (sem etapa de
   * build para `packages/agents`, mesmo padrão de `packages/domain`), que
   * NÃO suporta parameter properties (exigem transformação de código, não
   * só remoção de tipos — `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`). Provado por
   * `apps/api/test/runtime-smoke.e2e-spec.ts`, que sobe a API como
   * processo real de verdade.
   */
  private readonly deps: AgentRunOrchestratorDeps;

  constructor(deps: AgentRunOrchestratorDeps) {
    this.deps = deps;
  }

  async run(agentRunId: string, actor: OrchestratorActor): Promise<void> {
    const { store, events } = this.deps;
    const clock = this.deps.clock ?? (() => new Date());

    try {
      const run = await store.getAgentRun(agentRunId);
      if (!run || run.status !== 'queued') return;

      const task = await store.getTask(run.taskId, run.organizationId);
      if (!task) {
        await this.transitionToFailed(agentRunId);
        return;
      }

      const knowledgeQuery = [
        run.objective,
        task.title,
        task.description ?? '',
        task.acceptanceCriteria ?? '',
      ].join('\n');

      const [projectRules, repository, knowledgeContext] = await Promise.all([
        store.getProjectRules(task.projectId, run.organizationId),
        store.getRepositoryForProject(task.projectId, run.organizationId),
        store.getKnowledgeContext(task.projectId, run.organizationId, knowledgeQuery, 5),
      ]);

      const { root, repositoryFiles } = await this.loadRepository(repository, this.deps.repositoryReader);

      const priorSteps: AiPriorStepContext[] = [];
      let hasPendingApproval = false;
      let implementerPatch: SimulatedPatch | null = null;

      for (const stage of AGENT_PIPELINE) {
        const currentStatus = await store.getStatus(agentRunId);
        if (currentStatus === undefined || TERMINAL_STATUSES.has(currentStatus)) return;

        if (currentStatus !== stage.runStatus) {
          const transition = transitionAgentRunStatus(currentStatus, stage.runStatus);
          if (!transition.success) {
            await this.transitionToFailed(agentRunId);
            return;
          }
          await store.setStatus(agentRunId, stage.runStatus);
          events.publish({ agentRunId, status: stage.runStatus });
        }

        const agent = await store.getAgentByRole(run.organizationId, stage.role);
        const stepRecord = await store.createStep({
          agentRunId,
          name: stage.stepName,
          role: stage.role,
          input: {
            objective: run.objective,
            acceptanceCriteria: task.acceptanceCriteria,
            allowedTools: agent?.allowedTools ?? [],
            knowledgeContext: knowledgeContext.map((chunk) => ({
              sourceId: chunk.sourceId,
              title: chunk.title,
              uri: chunk.uri,
              kind: chunk.kind,
              chunkIndex: chunk.chunkIndex,
              score: chunk.score,
              hasPromptInjectionRisk: chunk.hasPromptInjectionRisk,
              wrappedContent: chunk.wrappedContent,
            })),
          },
        });

        if (!agent || !agent.isEnabled) {
          await this.recordTrace({
            name: 'agent.step',
            phase: 'start',
            agentRunId,
            stepId: stepRecord.id,
            role: stage.role,
            attributes: { stepName: stage.stepName },
          });
          await store.completeStep(stepRecord.id, {
            status: 'skipped',
            output: { reason: agent ? 'Agente desabilitado para este papel.' : 'Nenhum agente configurado para este papel.' },
            tokens: 0,
            costUsd: 0,
            durationMs: 0,
          });
          await this.recordTrace({
            name: 'agent.step',
            phase: 'end',
            agentRunId,
            stepId: stepRecord.id,
            role: stage.role,
            status: 'skipped',
            durationMs: 0,
            attributes: { reason: agent ? 'agent_disabled' : 'agent_missing' },
          });
          events.publish({ agentRunId, status: stage.runStatus });
          continue;
        }

        const startedAt = clock().getTime();
        await this.recordTrace({
          name: 'agent.step',
          phase: 'start',
          agentRunId,
          stepId: stepRecord.id,
          role: stage.role,
          attributes: { stepName: stage.stepName },
        });

        try {
          const generation = await this.deps.ai.generate({
            role: stage.role,
            objective: run.objective,
            acceptanceCriteria: task.acceptanceCriteria,
            availableTools: agent.allowedTools,
            repositoryFiles,
            knowledgeContext,
            priorSteps,
          });

          for (const proposal of generation.toolCalls) {
            // Defesa em profundidade independente da política geral (spec
            // §8): uma ferramenta fora do escopo mínimo do papel nunca é
            // sequer registrada, mesmo que `authorizeToolCall` a
            // autorizasse em outro contexto.
            if (!agent.allowedTools.includes(proposal.toolName)) continue;

            const toolCallRecord = await store.createToolCall({
              agentStepId: stepRecord.id,
              toolName: proposal.toolName,
              arguments: proposal.arguments,
            });
            const toolCallStartedAt = clock().getTime();
            await this.recordTrace({
              name: 'tool.call',
              phase: 'start',
              agentRunId,
              stepId: stepRecord.id,
              toolCallId: toolCallRecord.id,
              role: stage.role,
              toolName: proposal.toolName,
            });

            const authorization = authorizeToolCall({
              actor,
              resourceOrganizationId: run.organizationId,
              toolName: proposal.toolName,
              args: proposal.arguments,
            });

            if (authorization.decision === 'deny') {
              await store.completeToolCall(toolCallRecord.id, {
                status: 'rejected',
                result: { policyDecision: authorization },
              });
              await this.recordTrace({
                name: 'tool.call',
                phase: 'end',
                agentRunId,
                stepId: stepRecord.id,
                toolCallId: toolCallRecord.id,
                role: stage.role,
                toolName: proposal.toolName,
                status: 'rejected',
                durationMs: Math.max(0, clock().getTime() - toolCallStartedAt),
                attributes: { policyDecision: authorization.decision },
              });
              await this.recordPolicyDecision({
                agentRunId,
                organizationId: run.organizationId,
                actorUserId: actor.userId ?? null,
                stepId: stepRecord.id,
                toolCallId: toolCallRecord.id,
                role: stage.role,
                toolName: proposal.toolName,
                decision: 'deny',
                reason: authorization.reason,
              });
              continue;
            }

            if (authorization.decision === 'require_approval') {
              hasPendingApproval = true;
              await store.completeToolCall(toolCallRecord.id, {
                status: 'pending',
                result: { proposed: proposal.simulatedResult ?? null, policyDecision: authorization },
              });
              implementerPatch = this.extractSimulatedPatch(proposal.arguments, proposal.simulatedResult) ?? implementerPatch;
              await this.recordTrace({
                name: 'tool.call',
                phase: 'end',
                agentRunId,
                stepId: stepRecord.id,
                toolCallId: toolCallRecord.id,
                role: stage.role,
                toolName: proposal.toolName,
                status: 'pending',
                durationMs: Math.max(0, clock().getTime() - toolCallStartedAt),
                attributes: { policyDecision: authorization.decision },
              });
              await this.recordPolicyDecision({
                agentRunId,
                organizationId: run.organizationId,
                actorUserId: actor.userId ?? null,
                stepId: stepRecord.id,
                toolCallId: toolCallRecord.id,
                role: stage.role,
                toolName: proposal.toolName,
                decision: 'require_approval',
                reason: authorization.reason,
              });
              continue;
            }

            const execution = await executeRealTool(proposal.toolName, proposal.arguments, {
              root,
              repositoryFiles,
              repositoryReader: this.deps.repositoryReader,
              task,
              projectRules: projectRules ?? null,
              repository: repository ?? null,
              implementerPatch,
            });
            await store.completeToolCall(toolCallRecord.id, {
              status: execution.ok ? 'succeeded' : 'failed',
              result: execution.result,
            });
            await this.recordTrace({
              name: 'tool.call',
              phase: 'end',
              agentRunId,
              stepId: stepRecord.id,
              toolCallId: toolCallRecord.id,
              role: stage.role,
              toolName: proposal.toolName,
              status: execution.ok ? 'succeeded' : 'failed',
              durationMs: Math.max(0, clock().getTime() - toolCallStartedAt),
              attributes: { policyDecision: authorization.decision },
            });
          }

          const durationMs = Math.max(0, clock().getTime() - startedAt);
          const costUsd = estimateCostUsd(generation.usage);
          await store.completeStep(stepRecord.id, {
            status: 'succeeded',
            output: generation.output,
            tokens: generation.usage.totalTokens,
            costUsd,
            durationMs,
          });
          await this.recordTrace({
            name: 'agent.step',
            phase: 'end',
            agentRunId,
            stepId: stepRecord.id,
            role: stage.role,
            status: 'succeeded',
            durationMs,
            attributes: { tokens: generation.usage.totalTokens, costUsd },
          });
          await store.accumulateUsage(agentRunId, generation.usage.totalTokens, costUsd);

          priorSteps.push({ role: stage.role, summary: generation.summary, output: generation.output });
          events.publish({ agentRunId, status: stage.runStatus });
        } catch (error) {
          await store.completeStep(stepRecord.id, {
            status: 'failed',
            output: { error: error instanceof Error ? error.message : 'Erro desconhecido.' },
            tokens: 0,
            costUsd: 0,
            durationMs: Math.max(0, clock().getTime() - startedAt),
          });
          await this.recordTrace({
            name: 'agent.step',
            phase: 'end',
            agentRunId,
            stepId: stepRecord.id,
            role: stage.role,
            status: 'failed',
            durationMs: Math.max(0, clock().getTime() - startedAt),
            attributes: { error: error instanceof Error ? error.message : 'Erro desconhecido.' },
          });
          await this.transitionToFailed(agentRunId);
          return;
        }
      }

      await this.finishPipeline(agentRunId, hasPendingApproval);
    } catch {
      await this.transitionToFailed(agentRunId);
    }
  }

  /**
   * Sempre passa por `approval_required` antes de `completed` (o grafo de
   * `@forge/domain` não tem aresta direta `review -> completed`). Quando
   * nada nesta execução ficou pendente de aprovação humana, avança sozinho
   * para `completed`; quando algo ficou, para ali de propósito (Fase 11
   * cuida do fluxo de aprovação em si).
   */
  private async finishPipeline(agentRunId: string, hasPendingApproval: boolean): Promise<void> {
    const { store, events } = this.deps;

    const status = await store.getStatus(agentRunId);
    if (status === undefined || TERMINAL_STATUSES.has(status)) return;

    const toApprovalRequired = transitionAgentRunStatus(status, 'approval_required');
    if (!toApprovalRequired.success) {
      await this.transitionToFailed(agentRunId);
      return;
    }
    await store.setStatus(agentRunId, 'approval_required');
    events.publish({ agentRunId, status: 'approval_required' });

    if (hasPendingApproval) return;

    const afterApproval = await store.getStatus(agentRunId);
    if (afterApproval !== 'approval_required') return; // cancelado entre as duas escritas

    await store.setStatus(agentRunId, 'completed');
    events.publish({ agentRunId, status: 'completed' });
  }

  private async transitionToFailed(agentRunId: string): Promise<void> {
    const { store, events } = this.deps;
    const current = await store.getStatus(agentRunId);
    if (current === undefined || TERMINAL_STATUSES.has(current)) return;

    const transition = transitionAgentRunStatus(current, 'failed');
    if (!transition.success) return;

    await store.setStatus(agentRunId, 'failed');
    events.publish({ agentRunId, status: 'failed' });
  }

  private async loadRepository(
    repository: { name: string } | undefined,
    repositoryReader: RepositoryReader,
  ): Promise<{ root: string | null; repositoryFiles: RepositoryFileContent[] }> {
    if (!repository) return { root: null, repositoryFiles: [] };

    try {
      const root = repositoryReader.resolveRepositoryRoot(repository.name);
      await repositoryReader.ensureRepositoryExists(root);
      const repositoryFiles = await repositoryReader.listAllFiles(root);
      return { root, repositoryFiles };
    } catch {
      return { root: null, repositoryFiles: [] };
    }
  }

  private extractSimulatedPatch(
    args: Record<string, unknown>,
    simulatedResult: Record<string, unknown> | undefined,
  ): SimulatedPatch | null {
    const path = args['path'];
    const patch = simulatedResult?.['patch'];
    if (typeof path !== 'string' || typeof patch !== 'string') return null;

    const additions = simulatedResult?.['additions'];
    const deletions = simulatedResult?.['deletions'];
    return {
      path,
      patch,
      additions: typeof additions === 'number' ? additions : 0,
      deletions: typeof deletions === 'number' ? deletions : 0,
    };
  }

  private async recordTrace(event: AgentRunTraceEvent): Promise<void> {
    try {
      await this.deps.traces?.record(event);
    } catch {
      // Observabilidade nunca deve alterar o resultado da execução.
    }
  }

  private async recordPolicyDecision(event: Parameters<AgentRunGovernanceSink['recordPolicyDecision']>[0]): Promise<void> {
    try {
      await this.deps.governance?.recordPolicyDecision(event);
    } catch {
      // Auditoria auxiliar não deve alterar o resultado da execução.
    }
  }
}
