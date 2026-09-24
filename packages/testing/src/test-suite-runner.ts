import type { SandboxRunner, SandboxRunRequest } from '@forge/sandbox';
import { statusFromSandboxResult, summarizeTestFailure } from './failure-analysis.ts';
import type { TestRunResult, TestRunStatus, TestSuiteCommand, TestSuiteResult } from './types.ts';

export interface TestSuiteRunnerOptions {
  runner: SandboxRunner;
}

export class TestSuiteRunner {
  private readonly runner: SandboxRunner;

  constructor(options: TestSuiteRunnerOptions) {
    this.runner = options.runner;
  }

  async runSuites(suites: readonly TestSuiteCommand[]): Promise<TestRunResult> {
    const startedAt = Date.now();
    const results: TestSuiteResult[] = [];

    for (const suite of suites) {
      const request: SandboxRunRequest = {
        command: suite.command,
      };
      if (suite.args !== undefined) request.args = suite.args;
      if (suite.cwd !== undefined) request.cwd = suite.cwd;
      if (suite.timeoutMs !== undefined) request.timeoutMs = suite.timeoutMs;

      const result = await this.runner.run(request);
      const status = statusFromSandboxResult(result);
      results.push({
        name: suite.name,
        status,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        stdout: result.stdout,
        stderr: result.stderr,
        failureSummary: summarizeTestFailure(result),
      });
    }

    return summarizeRun(results, Date.now() - startedAt);
  }
}

function summarizeRun(suites: readonly TestSuiteResult[], durationMs: number): TestRunResult {
  const passedSuites = countByStatus(suites, 'passed');
  const failedSuites = countByStatus(suites, 'failed');
  const timedOutSuites = countByStatus(suites, 'timed_out');
  const blockedSuites = countByStatus(suites, 'blocked');
  const status: TestRunStatus =
    blockedSuites > 0 ? 'blocked' : timedOutSuites > 0 ? 'timed_out' : failedSuites > 0 ? 'failed' : 'passed';

  return {
    status,
    suites,
    durationMs,
    totalSuites: suites.length,
    passedSuites,
    failedSuites,
    timedOutSuites,
    blockedSuites,
  };
}

function countByStatus(suites: readonly TestSuiteResult[], status: TestRunStatus): number {
  return suites.filter((suite) => suite.status === status).length;
}
