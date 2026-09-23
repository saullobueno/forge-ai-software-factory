import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { transitionAgentRunStatus } from '@forge/domain';
import type { MessageEvent } from '@nestjs/common';
import { concat, map, type Observable, of } from 'rxjs';
import { AgentsRepository } from '../agents/agents.repository.js';
import { AgentRunEventsService } from './agent-run-events.service.js';
import { AgentRunsRepository, type AgentRunRow, type AgentRunWithSteps } from './agent-runs.repository.js';
import type { TaskRow } from '../tasks/tasks.repository.js';

@Injectable()
export class AgentRunsService {
  constructor(
    private readonly agentRunsRepository: AgentRunsRepository,
    private readonly agentsRepository: AgentsRepository,
    private readonly agentRunEvents: AgentRunEventsService,
  ) {}

  /**
   * Dispara uma execução de IA para uma tarefa (spec §7: "Uma tarefa pode
   * iniciar uma execução de IA com escopo e política explícitos"). Fase 4
   * só cria o registro em `queued` — nenhum step é processado (isso é o
   * orquestrador da Fase 7). Escolhe o agente `planner` da organização (ou
   * o primeiro agente habilitado, se não houver planner configurado);
   * organizações sem nenhum agente configurado não conseguem disparar
   * execuções — erro explícito em vez de inventar um agente.
   */
  async triggerForTask(task: TaskRow): Promise<AgentRunRow> {
    const agent = await this.agentsRepository.findPlannerOrFirstEnabled(task.organizationId);
    if (!agent) {
      throw new UnprocessableEntityException(
        'Nenhum agente de IA está configurado para esta organização.',
      );
    }

    return this.agentRunsRepository.create({
      organizationId: task.organizationId,
      taskId: task.id,
      agentId: agent.id,
      objective: `Implementar: ${task.title}`,
    });
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
  async cancel(id: string, organizationId: string): Promise<AgentRunRow> {
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
    return updated;
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
