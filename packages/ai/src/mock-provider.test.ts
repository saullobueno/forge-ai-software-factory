import type { AgentRole, AgentToolName } from '@forge/types';
import { describe, expect, it } from 'vitest';
import { MockAiProvider } from './mock-provider.ts';
import type { AiGenerateRequest } from './types.ts';

const ALL_READ_TOOLS: readonly AgentToolName[] = [
  'list_files',
  'read_file',
  'search_code',
  'inspect_git',
  'get_issue',
  'get_project_rules',
  'inspect_diff',
  'run_tests',
];

const REPOSITORY_FILES = [
  {
    path: 'src/lib/format-currency.ts',
    content: [
      'export function formatCurrency(amountInCents: number, currency: string): string {',
      '  const amount = Math.abs(amountInCents) / 100;',
      '  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);',
      '}',
    ].join('\n'),
  },
  {
    path: 'src/lib/invoice.ts',
    content: ['import { formatCurrency } from "./format-currency.ts";', '', 'export function formatInvoiceSummary() {}'].join(
      '\n',
    ),
  },
  {
    path: 'src/lib/format-currency.test.ts',
    content: 'import { describe, it, expect } from "vitest";\ndescribe("formatCurrency", () => { it("formats", () => {}); });',
  },
  { path: 'README.md', content: '# acme-platform-web\n\nBiblioteca de faturamento.' },
];

function baseRequest(overrides: Partial<AiGenerateRequest> & { role: AgentRole }): AiGenerateRequest {
  return {
    objective: 'Estornos aparecem como cobrança positiva na fatura por causa de Math.abs em formatCurrency',
    acceptanceCriteria: 'formatCurrency preserva o sinal negativo para estornos.',
    availableTools: ALL_READ_TOOLS,
    repositoryFiles: REPOSITORY_FILES,
    priorSteps: [],
    ...overrides,
  };
}

describe('MockAiProvider', () => {
  it('nunca chama rede e é determinístico: mesmo input produz sempre o mesmo output', async () => {
    const provider = new MockAiProvider();
    const request = baseRequest({ role: 'code_explorer' });

    const first = await provider.generate(request);
    const second = await provider.generate(request);

    expect(second).toStrictEqual(first);
  });

  it('é determinístico também entre instâncias diferentes do provedor', async () => {
    const request = baseRequest({ role: 'implementer', priorSteps: [{ role: 'code_explorer', summary: '', output: { filesFound: ['src/lib/format-currency.ts'] } }] });
    const resultA = await new MockAiProvider().generate(request);
    const resultB = await new MockAiProvider().generate(request);
    expect(resultA).toStrictEqual(resultB);
  });

  describe('planner', () => {
    it('propõe get_issue/get_project_rules/list_files quando disponíveis e nunca ferramentas de escrita', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(baseRequest({ role: 'planner' }));

      const toolNames = result.toolCalls.map((call) => call.toolName);
      expect(toolNames).toEqual(expect.arrayContaining(['get_issue', 'get_project_rules', 'list_files']));
      expect(toolNames.every((name) => ALL_READ_TOOLS.includes(name))).toBe(true);
      expect(Array.isArray(result.output['plan'])).toBe(true);
    });

    it('só propõe as ferramentas presentes em availableTools (nunca extrapola o escopo do papel)', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(baseRequest({ role: 'planner', availableTools: ['get_issue'] }));
      expect(result.toolCalls.map((call) => call.toolName)).toEqual(['get_issue']);
    });
  });

  describe('code_explorer', () => {
    it('encontra arquivos de verdade com base no conteúdo real do repositório (não é texto genérico)', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(baseRequest({ role: 'code_explorer' }));

      const filesFound = result.output['filesFound'];
      expect(Array.isArray(filesFound)).toBe(true);
      expect(filesFound).toContain('src/lib/format-currency.ts');
      // Toda tool call read_file proposta aponta para um arquivo que
      // realmente existe no contexto fornecido (nunca inventado).
      for (const call of result.toolCalls) {
        if (call.toolName === 'read_file') {
          const path = call.arguments['path'];
          expect(REPOSITORY_FILES.some((file) => file.path === path)).toBe(true);
        }
      }
    });

    it('não encontra nada quando o objetivo não bate com nenhum conteúdo real do repositório', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(
        baseRequest({
          role: 'code_explorer',
          objective: 'Adicionar suporte a autenticação via SSO corporativo',
          acceptanceCriteria: null,
        }),
      );
      expect(result.output['filesFound']).toEqual([]);
      expect(result.toolCalls.filter((call) => call.toolName === 'read_file')).toHaveLength(0);
    });
  });

  describe('implementer', () => {
    it('propõe apply_patch com simulatedResult coerente quando o code_explorer encontrou um arquivo', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(
        baseRequest({
          role: 'implementer',
          availableTools: [...ALL_READ_TOOLS, 'apply_patch'],
          priorSteps: [
            { role: 'code_explorer', summary: '', output: { filesFound: ['src/lib/format-currency.ts'] } },
          ],
        }),
      );

      expect(result.toolCalls).toHaveLength(1);
      const [call] = result.toolCalls;
      expect(call?.toolName).toBe('apply_patch');
      expect(call?.arguments['path']).toBe('src/lib/format-currency.ts');
      expect(call?.simulatedResult).toBeDefined();
      expect(String(call?.simulatedResult?.['patch'])).toContain('src/lib/format-currency.ts');
      expect(result.output['filesChanged']).toEqual(['src/lib/format-currency.ts']);
    });

    it('não propõe nenhuma tool call quando o code_explorer não encontrou nada (nada a implementar)', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(
        baseRequest({ role: 'implementer', priorSteps: [{ role: 'code_explorer', summary: '', output: { filesFound: [] } }] }),
      );
      expect(result.toolCalls).toHaveLength(0);
      expect(result.output['filesChanged']).toEqual([]);
    });

    it('respeita availableTools: usa write_file quando apply_patch não está disponível', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(
        baseRequest({
          role: 'implementer',
          availableTools: ['read_file', 'write_file'],
          priorSteps: [{ role: 'code_explorer', summary: '', output: { filesFound: ['src/lib/format-currency.ts'] } }],
        }),
      );
      expect(result.toolCalls.map((call) => call.toolName)).toEqual(['write_file']);
    });
  });

  describe('test_engineer', () => {
    it('identifica arquivos de teste reais do repositório', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(baseRequest({ role: 'test_engineer' }));
      expect(result.output['testFilesConsidered']).toEqual(['src/lib/format-currency.test.ts']);
      expect(result.toolCalls).toEqual([
        { toolName: 'run_tests', arguments: { paths: ['src/lib/format-currency.test.ts'] } },
      ]);
    });
  });

  describe('reviewer', () => {
    it('produz um finding "hypothesis" quando o implementer propôs uma mudança', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(
        baseRequest({
          role: 'reviewer',
          priorSteps: [{ role: 'implementer', summary: '', output: { filesChanged: ['src/lib/format-currency.ts'] } }],
        }),
      );
      const findings = result.output['findings'];
      expect(Array.isArray(findings)).toBe(true);
      if (Array.isArray(findings)) {
        expect(findings[0]).toMatchObject({ status: 'hypothesis', file: 'src/lib/format-currency.ts' });
      }
      expect(result.toolCalls.map((c) => c.toolName)).toContain('inspect_diff');
    });

    it('produz um finding "confirmed" de "nada a revisar" quando não houve mudança', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(
        baseRequest({ role: 'reviewer', priorSteps: [{ role: 'implementer', summary: '', output: { filesChanged: [] } }] }),
      );
      const findings = result.output['findings'];
      expect(Array.isArray(findings)).toBe(true);
      if (Array.isArray(findings)) {
        expect(findings[0]).toMatchObject({ status: 'confirmed' });
      }
      expect(result.toolCalls).toHaveLength(0);
    });
  });

  describe('documentation_agent', () => {
    it('nunca propõe ferramentas de escrita (apenas revisa)', async () => {
      const provider = new MockAiProvider();
      const result = await provider.generate(
        baseRequest({
          role: 'documentation_agent',
          availableTools: ['read_file', 'write_file', 'list_files', 'search_code'],
          priorSteps: [{ role: 'implementer', summary: '', output: { filesChanged: ['src/lib/format-currency.ts'] } }],
        }),
      );
      expect(result.toolCalls.every((call) => call.toolName !== 'write_file')).toBe(true);
      expect(result.output['filesChanged']).toEqual([]);
    });
  });
});
