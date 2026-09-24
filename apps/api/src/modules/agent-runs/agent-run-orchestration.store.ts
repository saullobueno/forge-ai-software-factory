import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or, schema } from '@forge/database';
import { retrieveKnowledge, wrapUntrustedKnowledge, type KnowledgeDocument } from '@forge/knowledge';
import type {
  AgentConfig,
  AgentKnowledgeContext,
  AgentRunContext,
  AgentRunStore,
  CompleteStepInput,
  CompleteToolCallInput,
  CreateStepInput,
  CreateToolCallInput,
  ProjectRulesContext,
  RecordAiUsageInput,
  RepositoryContext,
  TaskContext,
} from '@forge/agents';
import type { AgentRole, AgentRunStatus, AgentToolName } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

const TERMINAL_STATUSES: readonly AgentRunStatus[] = ['completed', 'failed', 'cancelled'];

/**
 * Implementação de `AgentRunStore` (`@forge/agents`) por cima de
 * Drizzle/Postgres — o único lugar em `apps/api` onde o orquestrador toca
 * o banco. `@forge/agents` nunca depende de Drizzle/NestJS diretamente
 * (ver o comentário de `AgentRunStore` em `packages/agents/src/ports.ts`);
 * este arquivo é o adaptador que fecha essa porta com infraestrutura real.
 */
@Injectable()
export class AgentRunOrchestrationStore implements AgentRunStore {
  constructor(private readonly database: DatabaseService) {}

  async getAgentRun(agentRunId: string): Promise<AgentRunContext | undefined> {
    const row = await this.database.db.query.agentRuns.findFirst({
      where: eq(schema.agentRuns.id, agentRunId),
    });
    if (!row) return undefined;
    return { id: row.id, organizationId: row.organizationId, taskId: row.taskId, status: row.status, objective: row.objective };
  }

  async getStatus(agentRunId: string): Promise<AgentRunStatus | undefined> {
    const row = await this.database.db.query.agentRuns.findFirst({
      where: eq(schema.agentRuns.id, agentRunId),
      columns: { status: true },
    });
    return row?.status;
  }

  async getTask(taskId: string, organizationId: string): Promise<TaskContext | undefined> {
    const row = await this.database.db.query.tasks.findFirst({
      where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, organizationId)),
    });
    if (!row) return undefined;
    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      description: row.description,
      acceptanceCriteria: row.acceptanceCriteria,
    };
  }

  async getProjectRules(projectId: string, organizationId: string): Promise<ProjectRulesContext | undefined> {
    const row = await this.database.db.query.projects.findFirst({
      where: and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, organizationId)),
      columns: { codeRules: true, architectureNotes: true },
    });
    if (!row) return undefined;
    return { codeRules: row.codeRules, architectureNotes: row.architectureNotes };
  }

  async getRepositoryForProject(projectId: string, organizationId: string): Promise<RepositoryContext | undefined> {
    const row = await this.database.db.query.repositories.findFirst({
      where: and(eq(schema.repositories.projectId, projectId), eq(schema.repositories.organizationId, organizationId)),
    });
    if (!row) return undefined;
    return { name: row.name, owner: row.owner, defaultBranch: row.defaultBranch };
  }

  async getKnowledgeContext(
    projectId: string,
    organizationId: string,
    query: string,
    limit: number,
  ): Promise<AgentKnowledgeContext[]> {
    const sources = await this.database.db.query.knowledgeSources.findMany({
      where: and(
        eq(schema.knowledgeSources.organizationId, organizationId),
        or(eq(schema.knowledgeSources.projectId, projectId), isNull(schema.knowledgeSources.projectId)),
      ),
      with: { chunks: { orderBy: [asc(schema.knowledgeChunks.chunkIndex)] } },
    });

    const documents: KnowledgeDocument[] = sources.flatMap((source) =>
      source.chunks.map((chunk) => ({
        sourceId: source.id,
        organizationId: source.organizationId,
        projectId: source.projectId,
        workspaceId: source.workspaceId,
        kind: source.kind,
        title: source.title,
        uri: source.uri,
        version: source.version,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
      })),
    );

    return retrieveKnowledge({
      documents,
      query,
      scope: { organizationId, projectId },
      limit,
    }).map((chunk) => ({
      sourceId: chunk.sourceId,
      title: chunk.title,
      uri: chunk.uri,
      kind: chunk.kind,
      content: chunk.content,
      wrappedContent: wrapUntrustedKnowledge(chunk.content),
      chunkIndex: chunk.chunkIndex,
      score: chunk.score,
      hasPromptInjectionRisk: chunk.hasPromptInjectionRisk,
    }));
  }

  async getAgentByRole(organizationId: string, role: AgentRole): Promise<AgentConfig | undefined> {
    const row = await this.database.db.query.agents.findFirst({
      where: and(eq(schema.agents.organizationId, organizationId), eq(schema.agents.role, role)),
    });
    if (!row) return undefined;
    return { id: row.id, role: row.role, isEnabled: row.isEnabled, allowedTools: row.allowedTools as AgentToolName[] };
  }

  /**
   * `startedAt` é preenchido na primeira transição para fora de `queued`
   * (se ainda não tiver sido); `completedAt`, quando o novo status é
   * terminal — mesmo raciocínio de `AgentRunsRepository.updateStatus`
   * (Fase 6), agora também usado pelo caminho de progresso real do
   * orquestrador, não só pelo cancelamento.
   */
  async setStatus(agentRunId: string, status: AgentRunStatus): Promise<void> {
    const current = await this.database.db.query.agentRuns.findFirst({
      where: eq(schema.agentRuns.id, agentRunId),
      columns: { startedAt: true },
    });

    await this.database.db
      .update(schema.agentRuns)
      .set({
        status,
        updatedAt: new Date(),
        ...(current && current.startedAt === null && status !== 'queued' ? { startedAt: new Date() } : {}),
        ...(TERMINAL_STATUSES.includes(status) ? { completedAt: new Date() } : {}),
      })
      .where(eq(schema.agentRuns.id, agentRunId));
  }

  async createStep(input: CreateStepInput): Promise<{ id: string }> {
    const [created] = await this.database.db
      .insert(schema.agentSteps)
      .values({
        agentRunId: input.agentRunId,
        name: input.name,
        role: input.role,
        status: 'running',
        input: input.input,
        startedAt: new Date(),
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir agentStep.');
    return { id: created.id };
  }

  async completeStep(stepId: string, update: CompleteStepInput): Promise<void> {
    await this.database.db
      .update(schema.agentSteps)
      .set({
        status: update.status,
        output: update.output,
        tokens: update.tokens,
        costUsd: update.costUsd.toFixed(6),
        durationMs: update.durationMs,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.agentSteps.id, stepId));
  }

  async createToolCall(input: CreateToolCallInput): Promise<{ id: string }> {
    const [created] = await this.database.db
      .insert(schema.toolCalls)
      .values({
        agentStepId: input.agentStepId,
        toolName: input.toolName,
        arguments: input.arguments,
        status: 'pending',
        startedAt: new Date(),
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir toolCall.');
    return { id: created.id };
  }

  /**
   * `completedAt` só é preenchido quando o status deixa de ser `pending` —
   * uma tool call `require_approval` fica genuinamente em aberto (aguarda
   * uma decisão humana da Fase 11), não "completou" no sentido de já ter
   * rodado de verdade.
   */
  async completeToolCall(toolCallId: string, update: CompleteToolCallInput): Promise<void> {
    await this.database.db
      .update(schema.toolCalls)
      .set({
        status: update.status,
        result: update.result,
        updatedAt: new Date(),
        ...(update.status === 'pending' ? {} : { completedAt: new Date() }),
      })
      .where(eq(schema.toolCalls.id, toolCallId));
  }

  async recordAiUsage(input: RecordAiUsageInput): Promise<void> {
    const [message] = await this.database.db
      .insert(schema.aiMessages)
      .values({
        organizationId: input.organizationId,
        agentStepId: input.agentStepId,
        role: 'assistant',
        content: input.content,
        provider: input.provider,
        model: input.model,
      })
      .returning();
    if (!message) throw new Error('Falha ao inserir aiMessage.');

    await this.database.db.insert(schema.aiUsages).values({
      organizationId: input.organizationId,
      agentRunId: input.agentRunId,
      agentStepId: input.agentStepId,
      aiMessageId: message.id,
      provider: input.provider,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      costUsd: input.costUsd.toFixed(6),
    });
  }

  /**
   * Lê o total vigente e escreve o incremento (em vez de um `UPDATE ...
   * SET total = total + x` atômico via SQL bruto): seguro aqui porque o
   * orquestrador processa os steps de uma execução estritamente em
   * sequência (nunca duas escritas concorrentes para o mesmo
   * `agentRunId`) — ver `AgentRunOrchestrator.run`.
   */
  async accumulateUsage(agentRunId: string, tokens: number, costUsd: number): Promise<void> {
    const current = await this.database.db.query.agentRuns.findFirst({
      where: eq(schema.agentRuns.id, agentRunId),
      columns: { totalTokens: true, totalCostUsd: true },
    });
    if (!current) return;

    await this.database.db
      .update(schema.agentRuns)
      .set({
        totalTokens: current.totalTokens + tokens,
        totalCostUsd: (Number(current.totalCostUsd) + costUsd).toFixed(6),
        updatedAt: new Date(),
      })
      .where(eq(schema.agentRuns.id, agentRunId));
  }
}
