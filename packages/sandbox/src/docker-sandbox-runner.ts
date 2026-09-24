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

export interface DockerSandboxRunnerOptions {
  workspaceRoot: string;
  image?: string;
  cpus?: number;
  memory?: string;
  network?: 'none' | 'bridge';
  timeoutMs?: number;
  maxOutputBytes?: number;
  envAllowlist?: readonly string[];
}

const DEFAULT_IMAGE = 'node:22-alpine';

export class DockerSandboxRunner implements SandboxRunner {
  private readonly workspaceRoot: string;
  private readonly image: string;
  private readonly cpus: number;
  private readonly memory: string;
  private readonly network: 'none' | 'bridge';
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly envAllowlist: ReadonlySet<string>;

  constructor(options: DockerSandboxRunnerOptions) {
    this.workspaceRoot = resolve(options.workspaceRoot);
    this.image = options.image ?? DEFAULT_IMAGE;
    this.cpus = options.cpus ?? 1;
    this.memory = options.memory ?? '512m';
    this.network = options.network ?? 'none';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_SANDBOX_LIMITS.timeoutMs;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_SANDBOX_LIMITS.maxOutputBytes;
    this.envAllowlist = new Set(options.envAllowlist ?? []);
  }

  static async isAvailable(): Promise<boolean> {
    const result = await runProcess('docker', ['version', '--format', '{{.Server.Version}}'], 5_000, 20_000);
    return result.exitCode === 0;
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

    const containerCwd = toContainerPath(cwd, this.workspaceRoot);
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;
    const maxOutputBytes = request.maxOutputBytes ?? this.maxOutputBytes;
    const dockerArgs = [
      'run',
      '--rm',
      '--network',
      this.network,
      '--cpus',
      String(this.cpus),
      '--memory',
      this.memory,
      '-v',
      `${this.workspaceRoot}:/workspace`,
      '-w',
      containerCwd,
      ...this.envArgs(request.env),
      this.image,
      request.command,
      ...args,
    ];

    const result = await runProcess('docker', dockerArgs, timeoutMs, maxOutputBytes);
    return {
      ...result,
      ok: !result.timedOut && result.exitCode === 0,
      blocked: false,
      reason: result.timedOut ? `Tempo limite excedido (${timeoutMs}ms).` : result.reason,
      durationMs: Date.now() - startedAt,
    };
  }

  private envArgs(env: Readonly<Record<string, string>> | undefined): string[] {
    const args: string[] = [];
    for (const [key, value] of Object.entries(env ?? {})) {
      if (this.envAllowlist.has(key)) args.push('-e', `${key}=${value}`);
    }
    return args;
  }
}

async function runProcess(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<SandboxRunResult> {
  const startedAt = Date.now();

  return await new Promise<SandboxRunResult>((resolveRun) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(command, [...args], {
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

function toContainerPath(cwd: string, workspaceRoot: string): string {
  const relativePath = cwd.slice(workspaceRoot.length).replace(/\\/g, '/').replace(/^\/+/, '');
  return relativePath.length > 0 ? `/workspace/${relativePath}` : '/workspace';
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
