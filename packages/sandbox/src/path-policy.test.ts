import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandLineForPolicy, resolveInsideWorkspace } from './path-policy.ts';

/**
 * Cobertura direta de `resolveInsideWorkspace` — até agora só era exercitada
 * indiretamente via `LocalProcessSandboxRunner` (`cwd` de `run_command`,
 * ver `local-process-sandbox-runner.test.ts`). A partir da conexão de
 * execução real atrás da aprovação humana
 * (`apps/api/src/modules/agent-runs/agent-run-workspace.service.ts`), esta
 * mesma função também passa a validar o caminho de `write_file`/
 * `apply_patch` aprovados — reforça aqui, isoladamente, a disciplina de
 * path traversal que os dois chamadores agora compartilham.
 */
describe('resolveInsideWorkspace', () => {
  const workspaceRoot = resolve('C:/forge-test-workspace');

  it('resolve um caminho relativo simples dentro do workspace', () => {
    expect(resolveInsideWorkspace(workspaceRoot, 'src/index.ts')).toBe(join(workspaceRoot, 'src', 'index.ts'));
  });

  it('resolve "." como o próprio root do workspace', () => {
    expect(resolveInsideWorkspace(workspaceRoot, '.')).toBe(workspaceRoot);
  });

  it('usa "." como padrão quando nenhum caminho é passado', () => {
    expect(resolveInsideWorkspace(workspaceRoot)).toBe(workspaceRoot);
  });

  it('resolve um caminho relativo aninhado dentro de um subdiretório', () => {
    expect(resolveInsideWorkspace(workspaceRoot, 'a/b/c.ts')).toBe(join(workspaceRoot, 'a', 'b', 'c.ts'));
  });

  it('rejeita ".." simples (escapa direto para o pai do workspace)', () => {
    expect(() => resolveInsideWorkspace(workspaceRoot, '..')).toThrow(/fora do workspace/);
  });

  it('rejeita um path traversal clássico ("../../etc/passwd")', () => {
    expect(() => resolveInsideWorkspace(workspaceRoot, '../../etc/passwd')).toThrow(/fora do workspace/);
  });

  it('rejeita um path traversal disfarçado dentro de um caminho aparentemente relativo', () => {
    expect(() => resolveInsideWorkspace(workspaceRoot, 'src/../../outside.ts')).toThrow(/fora do workspace/);
  });

  it('rejeita um caminho absoluto fora do workspace', () => {
    expect(() => resolveInsideWorkspace(workspaceRoot, resolve('C:/outra-pasta/arquivo.ts'))).toThrow(/fora do workspace/);
  });

  it('a mensagem de erro inclui o caminho solicitado (útil para diagnóstico, não vaza nada sensível)', () => {
    expect(() => resolveInsideWorkspace(workspaceRoot, '../secret.env')).toThrow('../secret.env');
  });
});

describe('commandLineForPolicy', () => {
  it('junta comando e args com espaço quando nenhum precisa de quoting', () => {
    expect(commandLineForPolicy('git', ['status'])).toBe('git status');
  });

  it('coloca em aspas um argumento que contém espaço', () => {
    expect(commandLineForPolicy('echo', ['hello world'])).toBe('echo "hello world"');
  });
});
