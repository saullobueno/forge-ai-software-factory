import type { SandboxRunRequest, SandboxRunResult, SandboxRunner } from '@forge/sandbox';
import { describe, expect, it } from 'vitest';
import { isFlakyHistory } from './flaky.ts';
import { TestSuiteRunner } from './test-suite-runner.ts';

describe('TestSuiteRunner', () => {
  it('deriva status passed/failed somente do resultado real do sandbox', async () => {
    const runner = new TestSuiteRunner({
      runner: new FakeSandboxRunner([
        sandboxResult({ exitCode: 0, stdout: 'ok' }),
        sandboxResult({ exitCode: 1, stderr: 'expected true to be false' }),
      ]),
    });

    const result = await runner.runSuites([
      { name: 'unit', command: 'pnpm', args: ['test'] },
      { name: 'integration', command: 'pnpm', args: ['test:integration'] },
    ]);

    expect(result.status).toBe('failed');
    expect(result.passedSuites).toBe(1);
    expect(result.failedSuites).toBe(1);
    expect(result.suites[1]?.failureSummary?.headline).toContain('exit code 1');
    expect(result.suites[1]?.failureSummary?.evidence).toEqual(['expected true to be false']);
  });

  it('prioriza bloqueio de política acima de falha comum', async () => {
    const runner = new TestSuiteRunner({
      runner: new FakeSandboxRunner([
        sandboxResult({ exitCode: 1, blocked: true, reason: 'Comando reconhecido como destrutivo.' }),
        sandboxResult({ exitCode: 0 }),
      ]),
    });

    const result = await runner.runSuites([
      { name: 'unsafe', command: 'rm', args: ['-rf', '/'] },
      { name: 'unit', command: 'pnpm', args: ['test'] },
    ]);

    expect(result.status).toBe('blocked');
    expect(result.blockedSuites).toBe(1);
    expect(result.suites[0]?.failureSummary?.headline).toContain('destrutivo');
  });

  it('marca timeout sem depender do exit code', async () => {
    const runner = new TestSuiteRunner({
      runner: new FakeSandboxRunner([sandboxResult({ exitCode: null, timedOut: true, reason: 'Tempo limite excedido.' })]),
    });

    const result = await runner.runSuites([{ name: 'slow', command: 'pnpm', args: ['test'] }]);

    expect(result.status).toBe('timed_out');
    expect(result.timedOutSuites).toBe(1);
  });

  it('detecta histórico flaky quando houve sucesso e falha reais', () => {
    expect(isFlakyHistory(['passed', 'failed'])).toBe(true);
    expect(isFlakyHistory(['blocked', 'failed', 'failed'])).toBe(false);
    expect(isFlakyHistory(['passed', 'passed'])).toBe(false);
  });
});

class FakeSandboxRunner implements SandboxRunner {
  private index = 0;
  private readonly results: readonly SandboxRunResult[];

  constructor(results: readonly SandboxRunResult[]) {
    this.results = results;
  }

  async run(_request: SandboxRunRequest): Promise<SandboxRunResult> {
    const result = this.results[this.index];
    this.index += 1;
    if (!result) throw new Error('FakeSandboxRunner sem resultado configurado.');
    return result;
  }
}

function sandboxResult(overrides: Partial<SandboxRunResult>): SandboxRunResult {
  return {
    ok: overrides.exitCode === 0 && !overrides.timedOut && !overrides.blocked,
    exitCode: 0,
    signal: null,
    timedOut: false,
    blocked: false,
    reason: null,
    stdout: '',
    stderr: '',
    durationMs: 10,
    ...overrides,
  };
}
