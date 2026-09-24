import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, schema } from '@forge/database';
import type { AgentRunStatus, ToolCallStatus } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type AgentRunRow = typeof schema.agentRuns.$inferSelect;
export type AgentStepRow = typeof schema.agentSteps.$inferSelect;
export type ToolCallRow = typeof schema.toolCalls.$inferSelect;

export type AgentStepWithToolCalls = AgentStepRow & { toolCalls: ToolCallRow[] };
export type AgentRunWithSteps = AgentRunRow & { steps: AgentStepWithToolCalls[] };

export interface CreateAgentRunInput {
  organizationId: string;
  taskId: string;
  agentId: string;
  objective: string;
}

const TERMINAL_STATUSES: readonly AgentRunStatus[] = ['completed', 'failed', 'cancelled'];

/**
 * Camada de acesso a dados para AgentRun (Fase 4/6). A criação em `queued`
 * (Fase 4) fica parada em fila de propósito — o orquestrador real que
 * avança `queued -> planning -> executing -> ...` é a Fase 7. A Fase 6
 * acrescenta leitura de detalhe (execução + steps + tool calls), listagem
 * por tarefa e a única escrita de status desta fase: `updateStatus`, usada
 * exclusivamente pelo cancelamento (uma transição de estado real via
 * `@forge/domain`, não um placeholder).
 */
@Injectable()
export class AgentRunsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateAgentRunInput): Promise<AgentRunRow> {
    const [created] = await this.database.db
      .insert(schema.agentRuns)
      .values({
        organizationId: input.organizationId,
        taskId: input.taskId,
        agentId: input.agentId,
        objective: input.objective,
        status: 'queued',
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir agentRun.');
    return created;
  }

  async findById(id: string, organizationId: string): Promise<AgentRunRow | undefined> {
    return this.database.db.query.agentRuns.findFirst({
      where: and(eq(schema.agentRuns.id, id), eq(schema.agentRuns.organizationId, organizationId)),
    });
  }

  /**
   * Execução + `agentSteps` (ordenados pela ordem real de criação — a
   * mesma ordem em que o pipeline os insere, spec §9) + `toolCalls` de cada
   * step, também em ordem de criação.
   */
  async findByIdWithSteps(id: string, organizationId: string): Promise<AgentRunWithSteps | undefined> {
    return this.database.db.query.agentRuns.findFirst({
      where: and(eq(schema.agentRuns.id, id), eq(schema.agentRuns.organizationId, organizationId)),
      with: {
        steps: {
          orderBy: [asc(schema.agentSteps.createdAt)],
          with: {
            toolCalls: { orderBy: [asc(schema.toolCalls.createdAt)] },
          },
        },
      },
    });
  }

  async listByTask(taskId: string, organizationId: string): Promise<AgentRunRow[]> {
    return this.database.db.query.agentRuns.findMany({
      where: and(eq(schema.agentRuns.taskId, taskId), eq(schema.agentRuns.organizationId, organizationId)),
      orderBy: [desc(schema.agentRuns.createdAt)],
    });
  }

  /**
   * Única escrita de status desta fase — quem chama (`AgentRunsService.cancel`)
   * já validou a transição via `transitionAgentRunStatus` antes de chegar
   * aqui; esta camada só persiste. `completedAt` é preenchido quando o novo
   * status é terminal (spec §9), igual ao que o seed faz manualmente para a
   * execução demo.
   */
  async updateStatus(id: string, status: AgentRunStatus): Promise<AgentRunRow> {
    const isTerminal = TERMINAL_STATUSES.includes(status);
    const [updated] = await this.database.db
      .update(schema.agentRuns)
      .set({
        status,
        updatedAt: new Date(),
        ...(isTerminal ? { completedAt: new Date() } : {}),
      })
      .where(eq(schema.agentRuns.id, id))
      .returning();
    if (!updated) throw new Error('Falha ao atualizar status do agentRun.');
    return updated;
  }

  /**
   * Resolve toda tool call ainda `pending` desta execução para `succeeded`
   * (aprovação) ou `rejected` (rejeição) — usado exclusivamente pelo fluxo
   * de decisão humana (`AgentRunsService.approve`/`.reject`). Só tool calls
   * `require_approval` ficam em `pending` de propósito (ver o comentário de
   * `AgentRunOrchestrationStore.completeToolCall`); depois de uma decisão,
   * nenhuma pode continuar "aguardando" — mesmo sem conectar execução real
   * (`@forge/sandbox` etc., fora do escopo desta tarefa), o `result` já
   * gravado pelo orquestrador (`{ proposed, policyDecision }`) permanece
   * intacto como registro do que foi aprovado/rejeitado. `agentStepId` é o
   * único vínculo entre `toolCalls` e a execução — não há coluna
   * `agentRunId` direta na tabela, daí o `IN` sobre os ids dos steps.
   */
  async resolvePendingToolCalls(agentRunId: string, status: Extract<ToolCallStatus, 'succeeded' | 'rejected'>): Promise<void> {
    const steps = await this.database.db.query.agentSteps.findMany({
      where: eq(schema.agentSteps.agentRunId, agentRunId),
      columns: { id: true },
    });
    const stepIds = steps.map((step) => step.id);
    if (stepIds.length === 0) return;

    await this.database.db
      .update(schema.toolCalls)
      .set({ status, updatedAt: new Date(), completedAt: new Date() })
      .where(and(inArray(schema.toolCalls.agentStepId, stepIds), eq(schema.toolCalls.status, 'pending')));
  }
}
