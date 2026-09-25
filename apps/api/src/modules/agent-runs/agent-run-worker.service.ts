import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { AiProvider } from '@forge/ai';
import { AgentRunOrchestrator, type OrchestratorActor } from '@forge/agents';
import { QUEUE_ADAPTER, type QueueAdapter } from '../../infrastructure/queue/queue.types.js';
import { RepositoryFsService } from '../../infrastructure/repository-fs/repository-fs.service.js';
import { AgentRunOrchestrationStore } from './agent-run-orchestration.store.js';
import { AgentRunEventsService } from './agent-run-events.service.js';
import { AgentRunGovernanceAuditService } from './agent-run-governance-audit.service.js';
import { AgentRunTestResultsService } from './agent-run-test-results.service.js';
import { AgentRunTraceLoggerService } from './agent-run-trace-logger.service.js';
import { AI_PROVIDER } from './ai-provider.token.js';

export interface AgentRunJobPayload {
  agentRunId: string;
  actor: OrchestratorActor;
}

/** Nome da fila registrada no `QueueAdapter` (Fase 0, `apps/api/src/infrastructure/queue/`) para execuções de IA. */
export const AGENT_RUN_QUEUE_NAME = 'agent-run.process';

/**
 * Primeiro consumidor real da fila do Forge (Fase 7). `QueueModule` (Fase
 * 0) já existia com um `QueueAdapter` completo (fila em memória por
 * padrão, BullMQ/Redis se `REDIS_URL` estiver definido) mas sem nenhum
 * handler registrado — `POST /tasks/:id/agent-runs` só criava o
 * `agentRun` em `queued` e parava aí (ver o comentário histórico removido
 * de `AgentRunsService.triggerForTask`).
 *
 * No `OnModuleInit`, registra o handler que processa cada job instanciando
 * um `AgentRunOrchestrator` (`@forge/agents`) com os adaptadores reais
 * desta app: `AgentRunOrchestrationStore` (Drizzle), `RepositoryFsService`
 * (leitura real do fixture em disco — compatível por tipagem estrutural
 * com o port `RepositoryReader`, sem nenhum adaptador extra),
 * `AgentRunEventsService` (o mesmo canal SSE da Fase 6, reaproveitado) e o
 * `AiProvider` resolvido por `createAiProvider()` (`@forge/ai`).
 */
@Injectable()
export class AgentRunWorkerService implements OnModuleInit {
  private readonly logger = new Logger(AgentRunWorkerService.name);
  private readonly orchestrator: AgentRunOrchestrator;

  constructor(
    @Inject(QUEUE_ADAPTER) private readonly queueAdapter: QueueAdapter,
    private readonly store: AgentRunOrchestrationStore,
    private readonly repositoryFs: RepositoryFsService,
    private readonly events: AgentRunEventsService,
    private readonly traces: AgentRunTraceLoggerService,
    private readonly governance: AgentRunGovernanceAuditService,
    private readonly testResults: AgentRunTestResultsService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {
    this.orchestrator = new AgentRunOrchestrator({
      store: this.store,
      ai: this.ai,
      repositoryReader: this.repositoryFs,
      events: this.events,
      traces: this.traces,
      governance: this.governance,
      testResults: this.testResults,
    });
  }

  onModuleInit(): void {
    this.queueAdapter.registerHandler<AgentRunJobPayload>(AGENT_RUN_QUEUE_NAME, async (payload) => {
      this.logger.log(`Processando agentRun ${payload.agentRunId}`);
      await this.orchestrator.run(payload.agentRunId, payload.actor);
    });
  }

  async enqueue(agentRunId: string, actor: OrchestratorActor): Promise<void> {
    await this.queueAdapter.enqueue<AgentRunJobPayload>(AGENT_RUN_QUEUE_NAME, { agentRunId, actor });
  }
}
