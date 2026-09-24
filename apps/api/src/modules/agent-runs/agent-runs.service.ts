import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { OrchestratorActor } from '@forge/agents';
import { transitionAgentRunStatus } from '@forge/domain';
import type { MessageEvent } from '@nestjs/common';
import type { AgentRunStatus } from '@forge/types';
import { concat, map, type Observable, of } from 'rxjs';
import { AgentsRepository } from '../agents/agents.repository.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { AgentRunApprovalsRepository } from './agent-run-approvals.repository.js';
import { AgentRunEventsService } from './agent-run-events.service.js';
import { AgentRunWorkerService } from './agent-run-worker.service.js';
import { AgentRunWorkspaceService } from './agent-run-workspace.service.js';
import { AgentRunsRepository, type AgentRunRow, type AgentRunWithSteps, type ToolCallRow } from './agent-runs.repository.js';
import type { TaskRow } from '../tasks/tasks.repository.js';

@Injectable()
export class AgentRunsService {
  constructor(
    private readonly agentRunsRepository: AgentRunsRepository,
    private readonly agentsRepository: AgentsRepository,
    private readonly agentRunEvents: AgentRunEventsService,
    private readonly agentRunWorker: AgentRunWorkerService,
    private readonly auditLogsService: AuditLogsService,
    private readonly agentRunApprovalsRepository: AgentRunApprovalsRepository,
    private readonly agentRunWorkspace: AgentRunWorkspaceService,
  ) {}

  /**
   * Dispara uma execução de IA para uma tarefa (spec §7: "Uma tarefa pode
   * iniciar uma execução de IA com escopo e política explícitos"). Cria o
   * `agentRun` em `queued` e enfileira um job real via `QueueAdapter`
   * (Fase 0) — `AgentRunWorkerService` (Fase 7) o consome e processa a
   * execução de ponta a ponta através de `AgentRunOrchestrator`
   * (`@forge/agents`). Escolhe o agente `planner` da organização (ou o
   * primeiro agente habilitado, se não houver planner configurado);
   * organizações sem nenhum agente configurado não conseguem disparar
   * execuções — erro explícito em vez de inventar um agente.
   *
   * `actor` é sempre o usuário que efetivamente chamou `POST
   * /tasks/:id/agent-runs` (já passou pelo guard `agent_run:trigger`) —
   * propagado pela fila para que o orquestrador avalie cada tool call com
   * o RBAC real desse usuário (spec §8/§20), não um papel de "sistema"
   * fixo.
   */
  async triggerForTask(task: TaskRow, actor: OrchestratorActor, actorUserId: string): Promise<AgentRunRow> {
    const agent = await this.agentsRepository.findPlannerOrFirstEnabled(task.organizationId);
    if (!agent) {
      throw new UnprocessableEntityException(
        'Nenhum agente de IA está configurado para esta organização.',
      );
    }

    const created = await this.agentRunsRepository.create({
      organizationId: task.organizationId,
      taskId: task.id,
      agentId: agent.id,
      objective: `Implementar: ${task.title}`,
    });

    await this.agentRunWorker.enqueue(created.id, actor);
    await this.auditLogsService.record({
      organizationId: task.organizationId,
      actorType: 'user',
      actorUserId,
      action: 'agent_run.triggered',
      targetType: 'agent_run',
      targetId: created.id,
      metadata: {
        taskId: task.id,
        agentId: agent.id,
        status: created.status,
      },
    });
    return created;
  }

  async listForTask(taskId: string, organizationId: string): Promise<AgentRunRow[]> {
    return this.agentRunsRepository.listByTask(taskId, organizationId);
  }

  /**
   * `undefined` para "não existe" OU "existe em outra organização" — mesmo
   * motivo de `TasksService.findById`: quem chama (controller) decide o 404
   * genérico nos dois casos.
   */
  async getDetail(id: string, organizationId: string): Promise<AgentRunWithSteps | undefined> {
    return this.agentRunsRepository.findByIdWithSteps(id, organizationId);
  }

  /**
   * Cancela uma execução (spec §9 — `cancelled` é um estado terminal
   * alcançável a partir de qualquer estado não-terminal do ciclo). A
   * transição em si nunca é reimplementada aqui: `transitionAgentRunStatus`
   * de `@forge/domain` é a única fonte de verdade sobre quais estados
   * podem virar `cancelled` — se não puder, responde 409 (conflito de
   * estado, não erro de validação de input) com uma mensagem que expõe o
   * status atual (não é informação sensível). Publica o evento no canal SSE
   * (`AgentRunEventsService`) só depois da escrita no banco ter sucesso.
   */
  async cancel(id: string, organizationId: string, actorUserId: string): Promise<AgentRunRow> {
    const run = await this.agentRunsRepository.findById(id, organizationId);
    if (!run) {
      throw new NotFoundException('Execução de IA não encontrada.');
    }

    const transition = transitionAgentRunStatus(run.status, 'cancelled');
    if (!transition.success) {
      throw new ConflictException(
        `Não é possível cancelar uma execução de IA em status "${run.status}".`,
      );
    }

    const updated = await this.agentRunsRepository.updateStatus(id, 'cancelled');
    this.agentRunEvents.publish({ agentRunId: id, status: updated.status });
    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: 'agent_run.cancelled',
      targetType: 'agent_run',
      targetId: updated.id,
      metadata: {
        previousStatus: run.status,
        status: updated.status,
        taskId: updated.taskId,
      },
    });
    return updated;
  }

  /**
   * Aprova uma execução parada em `approval_required` (spec §9/§18 —
   * fluxo de aprovação humana): a decisão só é aceita se a execução ainda
   * estiver nesse status exato (409 caso contrário, mesmo padrão de
   * `cancel`), e toda tool call que ficou `pending` aguardando essa decisão
   * é resolvida.
   *
   * Execução real, limitada e deliberada (ver `AgentRunWorkspaceService`):
   * toda tool call `write_file`/`apply_patch` pendente É aplicada de
   * verdade contra uma cópia isolada e descartável do repositório
   * (`.data/workspaces/<repositoryId>/`, nunca `fixtures/<repositoryName>/`
   * original) ANTES da execução ser marcada como `completed` — se algum
   * patch não aplicar limpo, a aprovação não "funciona" silenciosamente: a
   * execução vai para `failed` mesmo tendo sido aprovada pelo humano (ver
   * `applyApprovedWrites` abaixo). `run_command`/`run_tests`/
   * `create_commit`/`create_pull_request` continuam simulados — só o
   * `result` já gravado pelo orquestrador é preservado para essas.
   */
  async approve(id: string, organizationId: string, actorUserId: string, reason: string | null): Promise<AgentRunRow> {
    return this.decide(id, organizationId, actorUserId, 'approved', reason);
  }

  /**
   * Rejeita uma execução parada em `approval_required`. Transiciona para
   * `failed`, não `cancelled` — ambas as arestas existem no grafo de
   * `@forge/domain` a partir de `approval_required`, mas `cancelled` já
   * tem semântica própria e uma superfície de permissão diferente
   * (`agent_run:cancel`, concedida a quase todo papel — inclusive quem
   * disparou a execução — para interromper algo EM ANDAMENTO). Rejeitar
   * uma proposta já concluída pelo pipeline (a execução chegou até o fim,
   * só parou por exigir aprovação) não é "interromper" nada — é um veredito
   * sobre um resultado que já existe, e `failed` é o status que a máquina
   * de estados já usa para "esta execução não teve um desfecho aceito".
   * Reaproveitar `cancelled` aqui misturaria duas trilhas de auditoria
   * distintas sob o mesmo status; a diferença real entre "falhou por erro
   * técnico" e "foi rejeitada por um humano" fica registrada onde deveria
   * — na linha de `approvals` e no audit log (`agent_run.rejected`), não no
   * enum grosso de `AgentRunStatus`.
   */
  async reject(id: string, organizationId: string, actorUserId: string, reason: string | null): Promise<AgentRunRow> {
    return this.decide(id, organizationId, actorUserId, 'rejected', reason);
  }

  private async decide(
    id: string,
    organizationId: string,
    actorUserId: string,
    decision: 'approved' | 'rejected',
    reason: string | null,
  ): Promise<AgentRunRow> {
    const run = await this.agentRunsRepository.findById(id, organizationId);
    if (!run) {
      throw new NotFoundException('Execução de IA não encontrada.');
    }

    if (run.status !== 'approval_required') {
      throw new ConflictException(
        `Não é possível ${decision === 'approved' ? 'aprovar' : 'rejeitar'} uma execução de IA em status "${run.status}".`,
      );
    }

    // Execução real (limitada a `write_file`/`apply_patch`) acontece SÓ na
    // aprovação, e ANTES de qualquer transição de status ser persistida —
    // se algo falhar de verdade, o status final precisa refletir isso, não
    // um "completed" otimista escrito antes de saber o resultado real.
    const applied = decision === 'approved' ? await this.applyApprovedWrites(run, organizationId) : null;

    const targetStatus: AgentRunStatus = decision === 'rejected' || applied?.anyFailed ? 'failed' : 'completed';
    const transition = transitionAgentRunStatus(run.status, targetStatus);
    if (!transition.success) {
      throw new ConflictException(transition.error);
    }

    // `resolvePendingToolCalls` só enxerga tool calls ainda `pending` — as
    // que `applyApprovedWrites` já processou (sucesso ou falha real) já
    // saíram de `pending` (ver `updateToolCallResult`), então este UPDATE
    // em massa nunca as sobrescreve; ele resolve o que sobrou (ex.:
    // `run_command`, que continua simulado) com a decisão humana genérica.
    await this.agentRunsRepository.resolvePendingToolCalls(id, decision === 'approved' ? 'succeeded' : 'rejected');
    const updated = await this.agentRunsRepository.updateStatus(id, targetStatus);
    this.agentRunEvents.publish({ agentRunId: id, status: updated.status });

    const requestedByUserId = await this.auditLogsService.findLatestActorForTarget(
      organizationId,
      'agent_run',
      id,
      'agent_run.triggered',
    );
    await this.agentRunApprovalsRepository.create({
      organizationId,
      agentRunId: id,
      status: decision,
      requestedByUserId,
      approvedByUserId: actorUserId,
      reason,
    });

    await this.auditLogsService.record({
      organizationId,
      actorType: 'user',
      actorUserId,
      action: decision === 'approved' ? 'agent_run.approved' : 'agent_run.rejected',
      targetType: 'agent_run',
      targetId: updated.id,
      metadata: {
        previousStatus: run.status,
        status: updated.status,
        taskId: updated.taskId,
        reason,
        ...(applied && applied.processed.length > 0
          ? { appliedWrites: applied.processed.map(({ toolCallId, path, ok }) => ({ toolCallId, path, ok })) }
          : {}),
      },
    });

    if (applied && applied.processed.length > 0) {
      // Evento auxiliar dedicado (em vez de só sobrecarregar
      // `agent_run.approved` acima): torna "esta aprovação teve efeito real
      // em arquivos" localizável por ação no audit log sem precisar
      // inspecionar `metadata` de todo `agent_run.approved`. Nunca inclui
      // conteúdo de arquivo/patch — só caminho, sucesso/falha e hash (não
      // sensível) já presentes no `result` real da tool call.
      await this.auditLogsService.record({
        organizationId,
        actorType: 'user',
        actorUserId,
        action: 'agent_run.changes_applied',
        targetType: 'agent_run',
        targetId: updated.id,
        metadata: {
          repositoryId: applied.repositoryId,
          appliedWrites: applied.processed.map(({ toolCallId, path, ok, error }) => ({
            toolCallId,
            path,
            ok,
            ...(error ? { error } : {}),
          })),
        },
      });
    }

    return updated;
  }

  /**
   * Aplica de verdade toda tool call `write_file`/`apply_patch` que ficou
   * `pending` nesta execução (spec §18 — conectar execução real, limitada,
   * atrás da aprovação humana). Retorna `null` implicitamente via
   * `processed: []` quando não há nada a aplicar (nenhuma tool call de
   * escrita pendente, ou o projeto não tem repositório configurado — o
   * mesmo `undefined` gracioso que `AgentRunOrchestrator` já usa para
   * "sem repositório", não uma falha).
   *
   * Cada tool call processada tem seu `toolCall.result` REESCRITO com o
   * resultado real da escrita (`AgentRunWorkspaceService.applyApprovedWrite`),
   * substituindo o resultado simulado `{ proposed, policyDecision }` — o
   * resultado final nunca finge ter aplicado algo que não aplicou.
   */
  private async applyApprovedWrites(
    run: AgentRunRow,
    organizationId: string,
  ): Promise<{ processed: Array<{ toolCallId: string; path: string; ok: boolean; error?: string }>; anyFailed: boolean; repositoryId: string | null }> {
    const pendingWrites = await this.agentRunsRepository.findPendingWriteToolCalls(run.id);
    if (pendingWrites.length === 0) {
      return { processed: [], anyFailed: false, repositoryId: null };
    }

    const repository = await this.agentRunsRepository.findRepositoryForTask(run.taskId, organizationId);
    if (!repository) {
      // Sem repositório configurado para o projeto: não há workspace para
      // aplicar nada de verdade — degrada graciosamente (mesmo padrão de
      // `root: null` em `AgentRunOrchestrator`/`executeRealTool`). Estas
      // tool calls permanecem `pending` e caem no caminho simulado genérico
      // (`resolvePendingToolCalls`), exatamente como antes desta mudança.
      return { processed: [], anyFailed: false, repositoryId: null };
    }

    const processed: Array<{ toolCallId: string; path: string; ok: boolean; error?: string }> = [];
    let anyFailed = false;

    for (const toolCall of pendingWrites) {
      const proposed = this.extractProposed(toolCall);
      const outcome = await this.agentRunWorkspace.applyApprovedWrite({
        repositoryId: repository.id,
        repositoryName: repository.name,
        proposedPath: proposed?.path,
        proposedPatch: proposed?.patch,
      });

      const rawArgumentPath = toolCall.arguments['path'];
      const path =
        typeof proposed?.path === 'string' ? proposed.path : typeof rawArgumentPath === 'string' ? rawArgumentPath : 'desconhecido';
      await this.agentRunsRepository.updateToolCallResult(toolCall.id, outcome.ok ? 'succeeded' : 'failed', {
        ...outcome.result,
        policyDecision: (toolCall.result as { policyDecision?: unknown } | null)?.policyDecision ?? null,
      });

      if (!outcome.ok) anyFailed = true;
      processed.push({
        toolCallId: toolCall.id,
        path,
        ok: outcome.ok,
        ...(outcome.ok ? {} : { error: outcome.result.error }),
      });
    }

    return { processed, anyFailed, repositoryId: repository.id };
  }

  private extractProposed(toolCall: ToolCallRow): { path?: unknown; patch?: unknown } | null {
    const result = toolCall.result as { proposed?: { path?: unknown; patch?: unknown } } | null;
    return result?.proposed ?? null;
  }

  /**
   * Canal SSE de status (spec §9: "transmitir logs e status via
   * WebSockets/SSE"). Emite o status vigente assim que a conexão abre
   * (leitura fresca do banco — não assume que o cliente já sabe o estado
   * atual) e, na sequência, qualquer mudança publicada em
   * `AgentRunEventsService` enquanto a conexão permanecer aberta (ex.: um
   * cancelamento disparado por outra aba/cliente). Lança 404 antes de
   * qualquer emissão se a execução não existir/for de outra organização —
   * como isso acontece antes do primeiro `next()` do Observable, o SSE
   * ainda não comitou os headers HTTP e o filtro de exceções do Nest
   * consegue responder com o status correto (ver
   * `router-response-controller.js` — headers só são comitados no primeiro
   * `writeMessage`/depois de um `setTimeout(0)`).
   */
  async streamEvents(id: string, organizationId: string): Promise<Observable<MessageEvent>> {
    const run = await this.agentRunsRepository.findById(id, organizationId);
    if (!run) {
      throw new NotFoundException('Execução de IA não encontrada.');
    }

    const initial$ = of<MessageEvent>({ data: { status: run.status } });
    const updates$ = this.agentRunEvents
      .stream(id)
      .pipe(map((event): MessageEvent => ({ data: { status: event.status } })));

    return concat(initial$, updates$);
  }
}
