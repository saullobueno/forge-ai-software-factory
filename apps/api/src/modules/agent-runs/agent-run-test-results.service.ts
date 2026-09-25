import { Injectable } from '@nestjs/common';
import type { AgentRunTestResultSink, AgentTestSuiteOutcome, RecordTestRunInput } from '@forge/agents';
import { ArtifactStorageService } from '../artifacts/artifact-storage.service.js';
import { AgentRunTestResultsRepository } from './agent-run-test-results.repository.js';

/**
 * Implementa `AgentRunTestResultSink` (`@forge/agents`) — recebido pelo
 * `AgentRunOrchestrator` como `deps.testResults`. Toda vez que o step
 * `test_engineer` chama `run_tests` de verdade (leitura real dos arquivos
 * de teste do fixture, ver `packages/agents/src/real-tool-runner.ts`) e a
 * execução tem sucesso, este serviço:
 * 1. grava uma linha em `test_runs` (status/contagens derivados do que o
 *    orquestrador já computou, nunca decididos aqui);
 * 2. grava uma linha em `test_suites` por suíte;
 * 3. grava um log de texto como `test_artifacts` (kind `log`), reaproveitando
 *    `ArtifactStorageService` (mesmo armazenamento em disco já usado pela
 *    Fase 6) — não um mecanismo de artefato novo.
 */
@Injectable()
export class AgentRunTestResultsService implements AgentRunTestResultSink {
  constructor(
    private readonly repository: AgentRunTestResultsRepository,
    private readonly artifactStorage: ArtifactStorageService,
  ) {}

  async recordTestRun(input: RecordTestRunInput): Promise<void> {
    const completedAt = new Date();
    const startedAt = new Date(completedAt.getTime() - input.durationMs);

    const testRun = await this.repository.createTestRun({
      organizationId: input.organizationId,
      projectId: input.projectId,
      agentRunId: input.agentRunId,
      triggeredByUserId: input.triggeredByUserId,
      status: input.status,
      startedAt,
      completedAt,
      durationMs: input.durationMs,
    });

    await this.repository.createTestSuites(
      input.suites.map((suite) => ({
        testRunId: testRun.id,
        name: suite.name,
        status: suite.failedCount > 0 ? 'failed' : 'passed',
        passedCount: suite.passedCount,
        failedCount: suite.failedCount,
        skippedCount: suite.skippedCount,
      })),
    );

    const logContent = this.buildLogContent(input, testRun.id, startedAt, completedAt);
    const storageKey = `agent-runs/${input.agentRunId}/test-runs/${testRun.id}/run-tests.log`;
    await this.artifactStorage.writeContent(storageKey, logContent);
    await this.repository.createTestArtifact({
      testRunId: testRun.id,
      kind: 'log',
      name: 'run-tests.log',
      storageKey,
      sizeBytes: Buffer.byteLength(logContent, 'utf8'),
    });
  }

  private buildLogContent(input: RecordTestRunInput, testRunId: string, startedAt: Date, completedAt: Date): string {
    const totalPassed = input.suites.reduce((total, suite) => total + suite.passedCount, 0);
    const totalFailed = input.suites.reduce((total, suite) => total + suite.failedCount, 0);
    const totalSkipped = input.suites.reduce((total, suite) => total + suite.skippedCount, 0);

    const lines: string[] = [
      '$ run_tests — resultado real (Fase 9): leitura genuína dos arquivos de teste do repositório,',
      '  sem um processo de teste real rodando (ver packages/agents/src/real-tool-runner.ts).',
      '',
      ...input.suites.map((suite: AgentTestSuiteOutcome) => this.formatSuiteLine(suite)),
      '',
      `Test Suites  ${input.suites.length} (${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped)`,
      `Status       ${input.status}`,
      `testRunId    ${testRunId}`,
      `Start at     ${startedAt.toISOString()}`,
      `Completed at ${completedAt.toISOString()}`,
      `Duration     ${input.durationMs}ms`,
    ];
    return `${lines.join('\n')}\n`;
  }

  private formatSuiteLine(suite: AgentTestSuiteOutcome): string {
    const mark = suite.failedCount > 0 ? '✗' : '✓';
    const skippedSuffix = suite.skippedCount > 0 ? `, ${suite.skippedCount} skipped` : '';
    return `${mark} ${suite.name} (${suite.passedCount} passed, ${suite.failedCount} failed${skippedSuffix})`;
  }
}
