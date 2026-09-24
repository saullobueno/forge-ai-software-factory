import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DockerSandboxRunner } from './docker-sandbox-runner.ts';

describe('DockerSandboxRunner', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'forge-sandbox-docker-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('detecta disponibilidade do Docker sem lançar exceção', async () => {
    await expect(DockerSandboxRunner.isAvailable()).resolves.toEqual(expect.any(Boolean));
  });

  it('executa dentro de Docker quando o daemon está disponível', async () => {
    if (!(await DockerSandboxRunner.isAvailable())) {
      return;
    }

    const runner = new DockerSandboxRunner({
      workspaceRoot,
      image: 'node:22-alpine',
      timeoutMs: 20_000,
    });

    const result = await runner.run({
      command: 'node',
      args: ['-e', 'console.log(process.cwd())'],
    });

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe('/workspace');
  });
});
