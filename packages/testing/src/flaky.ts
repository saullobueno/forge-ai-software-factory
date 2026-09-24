import type { TestSuiteStatus } from './types.ts';

export function isFlakyHistory(history: readonly TestSuiteStatus[]): boolean {
  const executed = history.filter((status) => status !== 'blocked');
  return executed.includes('passed') && (executed.includes('failed') || executed.includes('timed_out'));
}
