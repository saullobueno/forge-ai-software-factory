import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalProcessSandboxRunner } from './local-process-sandbox-runner.ts';

describe('LocalProcessSandboxRunner', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'forge-sandbox-local-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('executa um comando permitido dentro do workspace', async () => {
    const runner = new LocalProcessSandboxRunner({ workspaceRoot });
    const result = await runner.run({
      command: process.execPath,
      args: ['-e', 'console.log(process.cwd())'],
    });

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe(workspaceRoot);
  });

  it('permite cwd relativo somente dentro do workspace', async () => {
    mkdirSync(join(workspaceRoot, 'app'));
    writeFileSync(join(workspaceRoot, 'app', 'marker.txt'), 'ok');

    const runner = new LocalProcessSandboxRunner({ workspaceRoot });
    const result = await runner.run({
      command: process.execPath,
      args: ['-e', 'console.log(process.cwd().endsWith("app"))'],
      cwd: 'app',
    });

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('true');
  });

  it('bloqueia cwd fora do workspace', async () => {
    const runner = new LocalProcessSandboxRunner({ workspaceRoot });
    const result = await runner.run({
      command: process.execPath,
      args: ['-e', 'console.log("never")'],
      cwd: '..',
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('fora do workspace');
  });

  it('bloqueia comandos destrutivos antes de spawnar processo', async () => {
    const runner = new LocalProcessSandboxRunner({ workspaceRoot });
    const result = await runner.run({
      command: 'rm',
      args: ['-rf', '/'],
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('destrutivo');
  });

  it('aplica allowlist de variáveis de ambiente', async () => {
    const runner = new LocalProcessSandboxRunner({
      workspaceRoot,
      envAllowlist: ['PATH', 'FORGE_SAFE_VAR'],
      baseEnv: { PATH: process.env['PATH'], SECRET_TOKEN: 'hidden' },
    });

    const result = await runner.run({
      command: process.execPath,
      args: [
        '-e',
        'console.log(JSON.stringify({safe: process.env.FORGE_SAFE_VAR ?? null, secret: process.env.SECRET_TOKEN ?? null}))',
      ],
      env: { FORGE_SAFE_VAR: 'visible', SECRET_TOKEN: 'leaked' },
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(result.stdout.trim())).toEqual({ safe: 'visible', secret: null });
  });

  it('interrompe processos que excedem o timeout', async () => {
    const runner = new LocalProcessSandboxRunner({ workspaceRoot, timeoutMs: 50 });
    const result = await runner.run({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 5_000)'],
    });

    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
  });
});
