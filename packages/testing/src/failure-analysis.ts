import type { SandboxRunResult } from '@forge/sandbox';
import type { TestFailureSummary, TestSuiteStatus } from './types.ts';

export function statusFromSandboxResult(result: SandboxRunResult): TestSuiteStatus {
  if (result.blocked) return 'blocked';
  if (result.timedOut) return 'timed_out';
  return result.exitCode === 0 ? 'passed' : 'failed';
}

export function summarizeTestFailure(result: SandboxRunResult): TestFailureSummary | null {
  const status = statusFromSandboxResult(result);
  if (status === 'passed') return null;

  if (status === 'blocked') {
    return {
      headline: result.reason ?? 'Execução bloqueada pela política do runner.',
      evidence: collectEvidence(result.stderr, result.stdout),
    };
  }

  if (status === 'timed_out') {
    return {
      headline: result.reason ?? 'Suite excedeu o tempo limite configurado.',
      evidence: collectEvidence(result.stderr, result.stdout),
    };
  }

  return {
    headline: `Processo de teste terminou com exit code ${result.exitCode ?? 'desconhecido'}.`,
    evidence: collectEvidence(result.stderr, result.stdout),
  };
}

function collectEvidence(stderr: string, stdout: string): readonly string[] {
  const lines = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.slice(-8);
}
