export interface SandboxRunRequest {
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface SandboxRunResult {
  ok: boolean;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  blocked: boolean;
  reason: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SandboxRunner {
  run(request: SandboxRunRequest): Promise<SandboxRunResult>;
}

export interface SandboxLimits {
  timeoutMs: number;
  maxOutputBytes: number;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  timeoutMs: 30_000,
  maxOutputBytes: 1_000_000,
};
