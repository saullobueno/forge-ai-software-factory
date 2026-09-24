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

  it(
    'executa dentro de Docker quando o daemon está disponível',
    async () => {
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
    },
    // Timeout do próprio teste (não o `timeoutMs` do runner, que só limita
    // o comando DEPOIS da imagem já estar disponível): num runner de CI
    // "frio" (ex.: ubuntu-latest do GitHub Actions, que tem Docker mas não
    // a imagem em cache), `docker run` puxa `node:22-alpine` pela rede
    // antes de executar — isso sozinho já passa dos 5000ms padrão do
    // Vitest. Confirmado: falhou por timeout em CI, nunca localmente (onde
    // não há Docker, então o teste retorna cedo em `isAvailable()`).
    60_000,
  );
});
