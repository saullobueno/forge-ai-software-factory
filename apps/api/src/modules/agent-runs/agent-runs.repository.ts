import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, schema } from '@forge/database';
import type { AgentRunStatus, AgentToolName, RepositoryProvider, ToolCallStatus } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type AgentRunRow = typeof schema.agentRuns.$inferSelect;
export type AgentStepRow = typeof schema.agentSteps.$inferSelect;
export type ToolCallRow = typeof schema.toolCalls.$inferSelect;
export type AiUsageRow = typeof schema.aiUsages.$inferSelect;
export type TestRunRow = typeof schema.testRuns.$inferSelect;
export type TestSuiteRow = typeof schema.testSuites.$inferSelect;
export type TestArtifactRow = typeof schema.testArtifacts.$inferSelect;

export type AgentStepWithToolCalls = AgentStepRow & { toolCalls: ToolCallRow[]; usages: AiUsageRow[] };
/**
 * `testRuns` (Fase 9 continuação): uma execução pode, em teoria, ter mais de
 * um `testRun` (a relação em `packages/database/src/schema/relations.ts` é
 * `many`), mas o orquestrador hoje só chama `run_tests` uma vez por
 * execução (um único step `test_engineer` no pipeline) — a UI trata a lista
 * como "o(s) testRun(s) desta execução", sem assumir exatamente um.
 */
export type TestRunWithDetails = TestRunRow & { suites: TestSuiteRow[]; artifacts: TestArtifactRow[] };
export type PullRequestRow = typeof schema.pullRequests.$inferSelect;
/**
 * `pullRequests` (Fase 10 continuação, mesma decisão de `testRuns`): uma
 * execução pode, em teoria, abrir mais de um PR — a UI/API tratam como
 * "o(s) PR(s) desta execução", sem assumir exatamente um, mesmo que o
 * gatilho atual (`AgentRunsService.applyApprovedWrites`) só produza no
 * máximo um por decisão de aprovação.
 */
export type AgentRunWithSteps = AgentRunRow & {
  steps: AgentStepWithToolCalls[];
  testRuns: TestRunWithDetails[];
  pullRequests: PullRequestRow[];
};

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
            usages: { orderBy: [asc(schema.aiUsages.createdAt)] },
          },
        },
        testRuns: {
          orderBy: [asc(schema.testRuns.createdAt)],
          with: {
            suites: { orderBy: [asc(schema.testSuites.createdAt)] },
            artifacts: { orderBy: [asc(schema.testArtifacts.createdAt)] },
          },
        },
        pullRequests: {
          orderBy: [asc(schema.pullRequests.createdAt)],
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
    const stepIds = await this.stepIdsForRun(agentRunId);
    if (stepIds.length === 0) return;

    await this.database.db
      .update(schema.toolCalls)
      .set({ status, updatedAt: new Date(), completedAt: new Date() })
      .where(and(inArray(schema.toolCalls.agentStepId, stepIds), eq(schema.toolCalls.status, 'pending')));
  }

  /**
   * Tool calls `write_file`/`apply_patch` que ficaram `pending` nesta
   * execução — a lista que `AgentRunsService.decide` precisa ANTES de
   * `resolvePendingToolCalls` rodar (que troca o status em massa), para
   * saber quais linhas processar com execução real (`AgentRunWorkspaceService`)
   * em vez de deixá-las cair no caminho simulado genérico.
   */
  async findPendingWriteToolCalls(agentRunId: string): Promise<ToolCallRow[]> {
    const stepIds = await this.stepIdsForRun(agentRunId);
    if (stepIds.length === 0) return [];

    const writeToolNames: AgentToolName[] = ['write_file', 'apply_patch'];
    return this.database.db.query.toolCalls.findMany({
      where: and(
        inArray(schema.toolCalls.agentStepId, stepIds),
        eq(schema.toolCalls.status, 'pending'),
        inArray(schema.toolCalls.toolName, writeToolNames),
      ),
    });
  }

  /**
   * Grava o resultado REAL de uma escrita aprovada (Fase 18 — conectar
   * execução real atrás da aprovação humana), substituindo o resultado
   * simulado (`{ proposed, policyDecision }`) gravado pelo orquestrador.
   * Chamado só para tool calls que `AgentRunWorkspaceService` de fato
   * processou — nunca para `run_command`/`create_commit`/etc., que
   * continuam resolvidas pelo caminho genérico (`resolvePendingToolCalls`).
   */
  async updateToolCallResult(
    toolCallId: string,
    status: Extract<ToolCallStatus, 'succeeded' | 'failed'>,
    result: Record<string, unknown>,
  ): Promise<void> {
    await this.database.db
      .update(schema.toolCalls)
      .set({ status, result, updatedAt: new Date(), completedAt: new Date() })
      .where(eq(schema.toolCalls.id, toolCallId));
  }

  /**
   * Resolve o repositório do projeto de uma execução (via `taskId` ->
   * `projectId` -> `repositories`), tenant-escopado por `organizationId`.
   * `undefined` quando o projeto não tem repositório configurado —
   * `AgentRunsService.decide` degrada graciosamente nesse caso (mesmo
   * padrão de `root: string | null` em `AgentRunOrchestrator`): nada real
   * para escrever, então a tool call cai no caminho simulado genérico.
   *
   * Inclui `owner`/`defaultBranch`/`provider`/`projectId` (não só
   * `id`/`name`, suficiente até a Fase 18): `AgentRunGitService` (Fase 10
   * continuação) precisa desses campos para instanciar `MockGitProvider`
   * com a referência real do repositório e gravar `pull_requests.provider`
   * — reaproveita esta mesma consulta em vez de duplicar o `WHERE`.
   */
  async findRepositoryForTask(
    taskId: string,
    organizationId: string,
  ): Promise<
    | {
        id: string;
        name: string;
        owner: string;
        defaultBranch: string;
        provider: RepositoryProvider;
        projectId: string;
        taskTitle: string;
      }
    | undefined
  > {
    const task = await this.database.db.query.tasks.findFirst({
      where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.organizationId, organizationId)),
      columns: { projectId: true, title: true },
    });
    if (!task) return undefined;

    const repository = await this.database.db.query.repositories.findFirst({
      where: and(eq(schema.repositories.projectId, task.projectId), eq(schema.repositories.organizationId, organizationId)),
      columns: { id: true, name: true, owner: true, defaultBranch: true, provider: true, projectId: true },
    });
    if (!repository) return undefined;
    return { ...repository, taskTitle: task.title };
  }

  private async stepIdsForRun(agentRunId: string): Promise<string[]> {
    const steps = await this.database.db.query.agentSteps.findMany({
      where: eq(schema.agentSteps.agentRunId, agentRunId),
      columns: { id: true },
    });
    return steps.map((step) => step.id);
  }
}
