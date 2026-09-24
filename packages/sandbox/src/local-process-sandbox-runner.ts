import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { isDestructiveCommandLine } from '@forge/domain';
import { commandLineForPolicy, resolveInsideWorkspace } from './path-policy.ts';
import { killProcessTree } from './process-tree.ts';
import {
  DEFAULT_SANDBOX_LIMITS,
  type SandboxRunRequest,
  type SandboxRunResult,
  type SandboxRunner,
} from './types.ts';

const DEFAULT_ENV_ALLOWLIST = [
  'CI',
  'FORCE_COLOR',
  'HOME',
  'LANG',
  'NODE_OPTIONS',
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'TEMP',
  'TMP',
  'USERPROFILE',
] as const;

export interface LocalProcessSandboxRunnerOptions {
  workspaceRoot: string;
  envAllowlist?: readonly string[];
  baseEnv?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

/**
 * Fallback local para desenvolvimento sem Docker. Ele não é uma sandbox de
 * kernel: a proteção aqui é de processo, workspace, timeout, env allowlist
 * e política de comandos. Por isso este runner fica desacoplado do
 * orquestrador até existir fluxo de aprovação humana para ações reais.
 */
export class LocalProcessSandboxRunner implements SandboxRunner {
  private readonly workspaceRoot: string;
  private readonly envAllowlist: ReadonlySet<string>;
  private readonly baseEnv: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;

  constructor(options: LocalProcessSandboxRunnerOptions) {
    this.workspaceRoot = resolve(options.workspaceRoot);
    this.envAllowlist = new Set(options.envAllowlist ?? DEFAULT_ENV_ALLOWLIST);
    this.baseEnv = options.baseEnv ?? process.env;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_SANDBOX_LIMITS.timeoutMs;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_SANDBOX_LIMITS.maxOutputBytes;
  }

  async run(request: SandboxRunRequest): Promise<SandboxRunResult> {
    const startedAt = Date.now();
    const args = request.args ?? [];
    const commandLine = commandLineForPolicy(request.command, args);

    if (isDestructiveCommandLine(commandLine)) {
      return blockedResult('Comando reconhecido como destrutivo e bloqueado por padrão.', startedAt);
    }

    let cwd: string;
    try {
      cwd = resolveInsideWorkspace(this.workspaceRoot, request.cwd);
    } catch (error) {
      return blockedResult(error instanceof Error ? error.message : 'Caminho fora do workspace isolado.', startedAt);
    }

    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    const maxOutputBytes = request.maxOutputBytes ?? this.maxOutputBytes;
    const env = this.buildEnv(request.env);

    return await new Promise<SandboxRunResult>((resolveRun) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      const child = spawn(request.command, [...args], {
        cwd,
        env,
        shell: false,
        detached: process.platform !== 'win32',
        windowsHide: true,
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        void killProcessTree(child.pid ?? 0);
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout = appendLimited(stdout, chunk, maxOutputBytes);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = appendLimited(stderr, chunk, maxOutputBytes);
      });

      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolveRun({
          ok: false,
          exitCode: null,
          signal: null,
          timedOut,
          blocked: false,
          reason: error.message,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
        });
      });

      child.once('close', (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolveRun({
          ok: !timedOut && exitCode === 0,
          exitCode,
          signal,
          timedOut,
          blocked: false,
          reason: timedOut ? `Tempo limite excedido (${timeoutMs}ms).` : null,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
        });
      });
    });
  }

  private buildEnv(requestEnv: Readonly<Record<string, string>> | undefined): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};

    for (const key of this.envAllowlist) {
      const value = this.baseEnv[key];
      if (value !== undefined) env[key] = value;
    }

    for (const [key, value] of Object.entries(requestEnv ?? {})) {
      if (this.envAllowlist.has(key)) env[key] = value;
    }

    return env;
  }
}

function appendLimited(current: string, chunk: Buffer, maxOutputBytes: number): string {
  const next = current + chunk.toString('utf8');
  if (Buffer.byteLength(next, 'utf8') <= maxOutputBytes) return next;
  return next.slice(0, maxOutputBytes);
}

function blockedResult(reason: string, startedAt: number): SandboxRunResult {
  return {
    ok: false,
    exitCode: null,
    signal: null,
    timedOut: false,
    blocked: true,
    reason,
    stdout: '',
    stderr: '',
    durationMs: Date.now() - startedAt,
  };
}
