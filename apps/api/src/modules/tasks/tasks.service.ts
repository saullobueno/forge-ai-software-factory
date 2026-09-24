import { Injectable } from '@nestjs/common';
import type { MemberRole } from '@forge/types';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';
import type { AgentRunRow } from '../agent-runs/agent-runs.repository.js';
import { TasksRepository, type TaskWithDependencies } from './tasks.repository.js';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly agentRunsService: AgentRunsService,
  ) {}

  /**
   * `undefined` tanto para "não existe" quanto para "existe em outra
   * organização" — mesmo motivo de `ProjectsService.findById`: o
   * controller responde 404 genérico nos dois casos.
   */
  async findById(taskId: string, organizationId: string): Promise<TaskWithDependencies | undefined> {
    return this.tasksRepository.findById(taskId, organizationId);
  }

  async listByProject(projectId: string, organizationId: string): Promise<TaskWithDependencies[]> {
    return this.tasksRepository.listByProject(projectId, organizationId);
  }

  /**
   * Retorna `undefined` quando a tarefa não existe no tenant do chamador —
   * o controller decide o 404, esta camada não lança exceções HTTP.
   * `actorRole` é o papel de quem chamou `POST /tasks/:id/agent-runs` —
   * propagado até o orquestrador (Fase 7) para autorização real de cada
   * tool call (spec §8/§20), não um papel de "sistema" fixo.
   */
  async triggerAgentRun(
    taskId: string,
    organizationId: string,
    actorRole: MemberRole,
    actorUserId: string,
  ): Promise<AgentRunRow | undefined> {
    const task = await this.tasksRepository.findById(taskId, organizationId);
    if (!task) return undefined;

    return this.agentRunsService.triggerForTask(
      task,
      { role: actorRole, organizationId, userId: actorUserId },
      actorUserId,
    );
  }

  /**
   * `undefined` quando a tarefa não existe no tenant do chamador — mesmo
   * contrato de `findById`/`triggerAgentRun` acima, o controller decide o
   * 404. Confirma a existência da tarefa ANTES de listar (em vez de listar
   * direto por `taskId`) para nunca vazar "esta tarefa tem N execuções" de
   * uma tarefa de outra organização via uma lista vazia vs. 404
   * inconsistentes.
   */
  async listAgentRuns(taskId: string, organizationId: string): Promise<AgentRunRow[] | undefined> {
    const task = await this.tasksRepository.findById(taskId, organizationId);
    if (!task) return undefined;

    return this.agentRunsService.listForTask(taskId, organizationId);
  }
}
