import { agentToolNameSchema } from '@forge/types';
import { describe, expect, it } from 'vitest';
import { decideToolPolicy } from './tool-policy';

describe('decideToolPolicy', () => {
  it('permite ferramentas somente leitura/inspeção', () => {
    for (const toolName of [
      'list_files',
      'read_file',
      'search_code',
      'inspect_git',
      'get_issue',
      'get_project_rules',
      'inspect_diff',
      'run_tests',
      'create_branch',
    ] as const) {
      expect(decideToolPolicy({ toolName }).decision).toBe('allow');
    }
  });

  it('exige aprovação para ferramentas que escrevem código/repositório/comandos', () => {
    for (const toolName of [
      'write_file',
      'apply_patch',
      'run_command',
      'create_commit',
      'create_pull_request',
    ] as const) {
      expect(decideToolPolicy({ toolName }).decision).toBe('require_approval');
    }
  });

  it('nunca deixa uma ferramenta sem classificação — toda ferramenta do enum recebe allow ou require_approval por padrão', () => {
    for (const toolName of agentToolNameSchema.options) {
      const decision = decideToolPolicy({ toolName }).decision;
      expect(['allow', 'require_approval']).toContain(decision);
    }
  });

  it('bloqueia run_command quando o comando é reconhecidamente destrutivo', () => {
    const destructiveCommands = [
      'rm -rf /',
      'rm -rf *',
      'DROP TABLE users;',
      'git push origin main --force',
      'git reset --hard HEAD~10',
    ];
    for (const command of destructiveCommands) {
      const result = decideToolPolicy({ toolName: 'run_command', args: { command } });
      expect(result.decision).toBe('deny');
    }
  });

  it('exige aprovação (não bloqueia) para um run_command não destrutivo', () => {
    const result = decideToolPolicy({
      toolName: 'run_command',
      args: { command: 'pnpm test' },
    });
    expect(result.decision).toBe('require_approval');
  });

  it('nunca aprova automaticamente uma ação potencialmente destrutiva sem avaliação', () => {
    const destructive = decideToolPolicy({
      toolName: 'run_command',
      args: { command: 'rm -rf /' },
    });
    expect(destructive.decision).not.toBe('allow');
  });
});
