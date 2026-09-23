import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AgentsRepository } from '../agents/agents.repository.js';
import { AgentRunsRepository, type AgentRunRow } from './agent-runs.repository.js';
import type { TaskRow } from '../tasks/tasks.repository.js';

@Injectable()
export class AgentRunsService {
  constructor(
    private readonly agentRunsRepository: AgentRunsRepository,
    private readonly agentsRepository: AgentsRepository,
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
}
