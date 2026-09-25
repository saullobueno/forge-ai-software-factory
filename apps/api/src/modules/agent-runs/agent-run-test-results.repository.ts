import { Injectable } from '@nestjs/common';
import { schema } from '@forge/database';
import type { TestRunStatus } from '@forge/types';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type TestRunRow = typeof schema.testRuns.$inferSelect;
export type TestSuiteRow = typeof schema.testSuites.$inferSelect;
export type TestArtifactRow = typeof schema.testArtifacts.$inferSelect;

export interface CreateTestRunInput {
  organizationId: string;
  projectId: string;
  agentRunId: string;
  triggeredByUserId: string | null;
  status: Extract<TestRunStatus, 'passed' | 'failed'>;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

export interface CreateTestSuiteInput {
  testRunId: string;
  name: string;
  status: Extract<TestRunStatus, 'passed' | 'failed'>;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
}

export interface CreateTestArtifactInput {
  testRunId: string;
  kind: 'log';
  name: string;
  storageKey: string;
  sizeBytes: number;
}

/**
 * Camada de acesso a dados para o resultado real de `run_tests` (Fase 9
 * continuação). Escreve nas mesmas tabelas já existentes desde a Fase 1
 * (`packages/database/src/schema/testing.ts`) — nenhuma migração nova.
 * Mesmo padrão do resto do módulo: `*Repository` fino, sem lógica de
 * decisão (quem decide status/contagens é `AgentRunTestResultsService`, a
 * partir do que `@forge/agents` já entregou).
 */
@Injectable()
export class AgentRunTestResultsRepository {
  constructor(private readonly database: DatabaseService) {}

  async createTestRun(input: CreateTestRunInput): Promise<TestRunRow> {
    const [created] = await this.database.db
      .insert(schema.testRuns)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId,
        agentRunId: input.agentRunId,
        triggeredByUserId: input.triggeredByUserId,
        status: input.status,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        durationMs: input.durationMs,
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir testRun.');
    return created;
  }

  async createTestSuites(inputs: readonly CreateTestSuiteInput[]): Promise<TestSuiteRow[]> {
    if (inputs.length === 0) return [];
    return this.database.db
      .insert(schema.testSuites)
      .values(
        inputs.map((input) => ({
          testRunId: input.testRunId,
          name: input.name,
          status: input.status,
          passedCount: input.passedCount,
          failedCount: input.failedCount,
          skippedCount: input.skippedCount,
        })),
      )
      .returning();
  }

  async createTestArtifact(input: CreateTestArtifactInput): Promise<TestArtifactRow> {
    const [created] = await this.database.db
      .insert(schema.testArtifacts)
      .values({
        testRunId: input.testRunId,
        kind: input.kind,
        name: input.name,
        storageKey: input.storageKey,
        sizeBytes: input.sizeBytes,
      })
      .returning();
    if (!created) throw new Error('Falha ao inserir testArtifact.');
    return created;
  }
}
