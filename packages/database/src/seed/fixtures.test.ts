import { applyPatch } from 'diff';
import { describe, expect, it } from 'vitest';
import { DEMO_BUGGY_FILE_PATH, loadDemoCurrencyBugDiff } from './fixtures.ts';

describe('loadDemoCurrencyBugDiff', () => {
  it('gera um patch que, aplicado ao conteúdo "antes", reproduz exatamente o conteúdo "depois"', () => {
    const demo = loadDemoCurrencyBugDiff();

    const applied = applyPatch(demo.beforeContent, demo.patch);

    expect(applied).not.toBe(false);
    expect(applied).toBe(demo.afterContent);
  });

  it('reflete o bug real (Math.abs descartando o sinal) sendo removido pelo fix', () => {
    const demo = loadDemoCurrencyBugDiff();

    expect(demo.path).toBe(DEMO_BUGGY_FILE_PATH);
    expect(demo.beforeContent).toContain('Math.abs(amountInCents)');
    expect(demo.afterContent).not.toContain('Math.abs(');
    expect(demo.beforeContent).not.toBe(demo.afterContent);
  });

  it('calcula hashes sha256 reais e distintos para antes/depois, e tamanhos reais em bytes', () => {
    const demo = loadDemoCurrencyBugDiff();

    expect(demo.beforeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(demo.afterHash).toMatch(/^[0-9a-f]{64}$/);
    expect(demo.beforeHash).not.toBe(demo.afterHash);
    expect(demo.beforeSizeBytes).toBe(Buffer.byteLength(demo.beforeContent, 'utf8'));
    expect(demo.afterSizeBytes).toBe(Buffer.byteLength(demo.afterContent, 'utf8'));
  });

  it('reporta ao menos uma adição e uma remoção reais no patch', () => {
    const demo = loadDemoCurrencyBugDiff();

    expect(demo.additions).toBeGreaterThan(0);
    expect(demo.deletions).toBeGreaterThan(0);
  });
});
