import { describe, expect, it } from 'vitest';
import { decideToolPolicy, defaultToolDecision, isAtLeastAsStrict } from './tool-policy.ts';

describe('ajustes de política por organização (tighten-only)', () => {
  it('expõe a decisão padrão de cada ferramenta', () => {
    expect(defaultToolDecision('read_file')).toBe('allow');
    expect(defaultToolDecision('write_file')).toBe('require_approval');
  });

  it('ordena allow < require_approval < deny', () => {
    expect(isAtLeastAsStrict('deny', 'require_approval')).toBe(true);
    expect(isAtLeastAsStrict('require_approval', 'require_approval')).toBe(true);
    expect(isAtLeastAsStrict('allow', 'require_approval')).toBe(false);
  });

  it('permite exigir aprovação para uma ferramenta de leitura e bloquear uma de escrita', () => {
    expect(decideToolPolicy({ toolName: 'read_file' }, { read_file: 'require_approval' })).toMatchObject({
      decision: 'require_approval',
      reason: expect.stringContaining('Política da organização'),
    });
    expect(decideToolPolicy({ toolName: 'write_file' }, { write_file: 'deny' }).decision).toBe('deny');
  });

  it('IGNORA um ajuste mais frouxo que o padrão: escrita nunca vira allow', () => {
    expect(decideToolPolicy({ toolName: 'write_file' }, { write_file: 'allow' }).decision).toBe('require_approval');
    expect(decideToolPolicy({ toolName: 'apply_patch' }, { apply_patch: 'allow' }).decision).toBe('require_approval');
  });

  it('comando destrutivo continua negado, com ou sem ajuste', () => {
    const args = { command: 'rm -rf /' };
    expect(decideToolPolicy({ toolName: 'run_command', args }, { run_command: 'allow' }).decision).toBe('deny');
    expect(decideToolPolicy({ toolName: 'run_command', args }).decision).toBe('deny');
  });

  it('sem ajustes, o comportamento é idêntico ao anterior', () => {
    expect(decideToolPolicy({ toolName: 'list_files' })).toEqual(decideToolPolicy({ toolName: 'list_files' }, {}));
  });
});
