import { Injectable } from '@nestjs/common';
import { schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type AgentRunRow = typeof schema.agentRuns.$inferSelect;

export interface CreateAgentRunInput {
  organizationId: string;
  taskId: string;
  agentId: string;
  objective: string;
}

/**
 * Camada de acesso a dados para AgentRun (Fase 4 — só a criação em estado
 * `queued`, ver `AgentRunsService`. A máquina de estados real que avança
 * `queued -> planning -> executing -> ...` é o orquestrador da Fase 7; aqui
 * a linha fica parada em fila de propósito.
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
}
