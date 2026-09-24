export type TestSuiteStatus = 'passed' | 'failed' | 'timed_out' | 'blocked';
export type TestRunStatus = TestSuiteStatus;

export interface TestSuiteCommand {
  name: string;
  command: string;
  args?: readonly string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface TestFailureSummary {
  headline: string;
  evidence: readonly string[];
}

export interface TestSuiteResult {
  name: string;
  status: TestSuiteStatus;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  failureSummary: TestFailureSummary | null;
}

export interface TestRunResult {
  status: TestRunStatus;
  suites: readonly TestSuiteResult[];
  durationMs: number;
  totalSuites: number;
  passedSuites: number;
  failedSuites: number;
  timedOutSuites: number;
  blockedSuites: number;
}
