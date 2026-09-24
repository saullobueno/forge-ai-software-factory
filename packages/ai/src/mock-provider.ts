import type { AgentToolName, FindingSeverity } from '@forge/types';
import type {
  AiGenerateRequest,
  AiGenerateResult,
  AiProposedToolCall,
  AiProvider,
  AiRepositoryFileContext,
  AiUsage,
} from './types.ts';

/**
 * Palavras sem valor discriminativo para a busca de arquivos relevantes
 * (PT/EN misturado — objetivos de tarefa no Forge são majoritariamente em
 * português, spec §21). Deliberadamente pequeno: o objetivo aqui é apenas
 * remover ruído óbvio, não construir um tokenizador linguístico real.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'que', 'para', 'com', 'uma', 'um',
  'na', 'no', 'os', 'as', 'the', 'and', 'for', 'with', 'ao', 'aos', 'se',
  'por', 'sem', 'sua', 'seu', 'suas', 'seus', 'mais', 'como', 'ou', 'nao',
  'não', 'este', 'esta', 'isso', 'the',
]);

function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const words = normalized.split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return Array.from(new Set(words));
}

/**
 * Estimativa determinística de tokens (não precisa ser realista — spec do
 * briefing da Fase 7 — só precisa ser uma função pura do texto de entrada,
 * nunca `Math.random()`/timestamp não seedado).
 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function usageFor(promptText: string, completionText: string): AiUsage {
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(completionText);
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

function includesTool(available: readonly AgentToolName[], tool: AgentToolName): boolean {
  return available.includes(tool);
}

function readStringArray(output: Record<string, unknown>, key: string): string[] {
  const value = output[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

interface ScoredFile {
  file: AiRepositoryFileContext;
  score: number;
  matchedKeywords: string[];
}

/**
 * Pontua cada arquivo real do repositório pela quantidade de ocorrências
 * das palavras-chave do objetivo — busca de verdade sobre conteúdo real
 * (spec §21), sem qualquer chamada de rede ou geração de texto livre.
 */
function scoreRepositoryFiles(
  files: readonly AiRepositoryFileContext[],
  keywords: readonly string[],
): ScoredFile[] {
  const scored: ScoredFile[] = [];
  for (const file of files) {
    const haystack = `${file.path}\n${file.content}`.toLowerCase();
    const matchedKeywords = keywords.filter((keyword) => haystack.includes(keyword));
    if (matchedKeywords.length === 0) continue;
    const score = matchedKeywords.reduce((total, keyword) => total + haystack.split(keyword).length - 1, 0);
    scored.push({ file, score, matchedKeywords });
  }
  return scored.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
}

function firstMatchingLine(content: string, keywords: readonly string[]): string | null {
  for (const line of content.split('\n')) {
    const lowered = line.toLowerCase();
    if (keywords.some((keyword) => lowered.includes(keyword))) return line.trim();
  }
  return null;
}

/**
 * Provedor de IA determinístico (Fase 7, spec §21 — "Modo Demo... incluir
 * uma implementação simulada que cria um diff, executa testes e produz
 * findings de revisão sem exigir credenciais externas"). Nunca chama rede;
 * nunca usa `Math.random()`/`Date.now()` na lógica de decisão — o mesmo
 * input sempre produz o mesmo output (`mock-provider.test.ts` prova isso
 * diretamente). Cada papel usa o conteúdo REAL passado em
 * `AiGenerateRequest.repositoryFiles`/`priorSteps` (lido de verdade pelo
 * orquestrador contra o fixture em disco) para decidir tool calls e saída —
 * nunca texto genérico desconectado do que foi realmente encontrado.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'mock-deterministic';

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    switch (request.role) {
      case 'planner':
        return this.generatePlanner(request);
      case 'code_explorer':
        return this.generateCodeExplorer(request);
      case 'implementer':
        return this.generateImplementer(request);
      case 'test_engineer':
        return this.generateTestEngineer(request);
      case 'reviewer':
        return this.generateReviewer(request);
      case 'documentation_agent':
        return this.generateDocumentationAgent(request);
    }
  }

  private generatePlanner(request: AiGenerateRequest): AiGenerateResult {
    const { objective, acceptanceCriteria, availableTools, knowledgeContext } = request;

    const toolCalls: AiProposedToolCall[] = [];
    if (includesTool(availableTools, 'get_issue')) {
      toolCalls.push({ toolName: 'get_issue', arguments: {} });
    }
    if (includesTool(availableTools, 'get_project_rules')) {
      toolCalls.push({ toolName: 'get_project_rules', arguments: {} });
    }
    if (includesTool(availableTools, 'list_files')) {
      toolCalls.push({ toolName: 'list_files', arguments: { path: '' } });
    }

    const plan = [
      `Entender o objetivo: ${objective}`,
      acceptanceCriteria
        ? `Confirmar os critérios de aceite: ${acceptanceCriteria}`
        : 'Nenhum critério de aceite explícito — inferir o resultado esperado a partir do objetivo.',
      ...(knowledgeContext.length > 0
        ? [`Considerar ${knowledgeContext.length} trecho(s) de conhecimento persistido recuperados para o projeto.`]
        : []),
      'Localizar no repositório os arquivos relevantes para o objetivo.',
      'Avaliar se alguma alteração de código é necessária e, em caso positivo, propor um patch mínimo.',
      'Rodar a suíte de testes relevante e revisar o resultado antes de qualquer aprovação.',
    ];
    const output = {
      plan,
      estimatedRisk: acceptanceCriteria ? 'medium' : 'low',
      knowledgeSourcesUsed: knowledgeContext.map((chunk) => ({
        sourceId: chunk.sourceId,
        title: chunk.title,
        uri: chunk.uri,
        kind: chunk.kind,
        chunkIndex: chunk.chunkIndex,
        score: chunk.score,
        hasPromptInjectionRisk: chunk.hasPromptInjectionRisk,
      })),
    };
    const summary = `Plano com ${plan.length} passos definido a partir do objetivo.`;

    return {
      summary,
      toolCalls,
      output,
      usage: usageFor(
        `${objective}${acceptanceCriteria ?? ''}${knowledgeContext.map((chunk) => chunk.wrappedContent).join('\n')}`,
        summary + JSON.stringify(output),
      ),
    };
  }

  private generateCodeExplorer(request: AiGenerateRequest): AiGenerateResult {
    const { objective, acceptanceCriteria, availableTools, repositoryFiles } = request;
    const keywords = tokenize(`${objective} ${acceptanceCriteria ?? ''}`);
    const scored = scoreRepositoryFiles(repositoryFiles, keywords).slice(0, 3);

    const toolCalls: AiProposedToolCall[] = [];
    if (includesTool(availableTools, 'read_file')) {
      for (const { file } of scored) {
        toolCalls.push({ toolName: 'read_file', arguments: { path: file.path } });
      }
    }
    const [topKeyword] = keywords;
    if (topKeyword && includesTool(availableTools, 'search_code')) {
      toolCalls.push({ toolName: 'search_code', arguments: { query: topKeyword } });
    }

    const filesFound = scored.map((entry) => entry.file.path);
    const [topMatch] = scored;
    const relevantSnippet = topMatch ? firstMatchingLine(topMatch.file.content, topMatch.matchedKeywords) : null;

    const summary =
      filesFound.length > 0
        ? `Encontrados ${filesFound.length} arquivo(s) relevante(s) para o objetivo: ${filesFound.join(', ')}.`
        : 'Nenhum arquivo do repositório corresponde às palavras-chave do objetivo.';
    const output = { keywords, filesFound, relevantSnippet };

    return { summary, toolCalls, output, usage: usageFor(objective, summary + JSON.stringify(output)) };
  }

  private generateImplementer(request: AiGenerateRequest): AiGenerateResult {
    const { objective, availableTools, repositoryFiles, priorSteps } = request;
    const explorerStep = priorSteps.find((step) => step.role === 'code_explorer');
    const filesFound = explorerStep ? readStringArray(explorerStep.output, 'filesFound') : [];
    const [targetPath] = filesFound;

    if (!targetPath) {
      const summary = 'Nenhum arquivo relevante foi encontrado — nenhuma alteração de código é necessária para este objetivo.';
      const output = { filesChanged: [], summary };
      return { summary, toolCalls: [], output, usage: usageFor(objective, summary) };
    }

    const targetFile = repositoryFiles.find((file) => file.path === targetPath);
    const content = targetFile?.content ?? '';
    const [firstLine] = content.split('\n');
    const comment = `// Forge: revisão automática para "${objective}"`;
    const patch = [
      `--- a/${targetPath}`,
      `+++ b/${targetPath}`,
      '@@ -1,1 +1,2 @@',
      ` ${firstLine ?? ''}`,
      `+${comment}`,
    ].join('\n');

    const writeTool: AgentToolName = includesTool(availableTools, 'apply_patch') ? 'apply_patch' : 'write_file';
    const canPropose = includesTool(availableTools, writeTool);

    const toolCalls: AiProposedToolCall[] = canPropose
      ? [
          {
            toolName: writeTool,
            arguments: { path: targetPath, instruction: `Ajustar ${targetPath} para atender: ${objective}` },
            simulatedResult: { path: targetPath, patch, additions: 1, deletions: 0 },
          },
        ]
      : [];

    const summary = canPropose
      ? `Patch proposto em ${targetPath} para atender ao objetivo (aguardando aprovação).`
      : `Alteração identificada em ${targetPath}, mas nenhuma ferramenta de escrita está disponível para este papel.`;
    const output = { filesChanged: canPropose ? [targetPath] : [], summary };

    return {
      summary,
      toolCalls,
      output,
      usage: usageFor(objective + content.slice(0, 200), summary + patch),
    };
  }

  private generateTestEngineer(request: AiGenerateRequest): AiGenerateResult {
    const { objective, availableTools, repositoryFiles } = request;
    const testFiles = repositoryFiles.filter((file) => /\.test\.[jt]sx?$/.test(file.path)).map((file) => file.path);

    const toolCalls: AiProposedToolCall[] = includesTool(availableTools, 'run_tests')
      ? [{ toolName: 'run_tests', arguments: { paths: testFiles } }]
      : [];

    const summary =
      testFiles.length > 0
        ? `Suíte de testes identificada: ${testFiles.length} arquivo(s).`
        : 'Nenhum arquivo de teste encontrado no repositório.';
    const output = { testFilesConsidered: testFiles };

    return { summary, toolCalls, output, usage: usageFor(objective, summary + JSON.stringify(output)) };
  }

  private generateReviewer(request: AiGenerateRequest): AiGenerateResult {
    const { objective, availableTools, priorSteps } = request;
    const implementerStep = priorSteps.find((step) => step.role === 'implementer');
    const filesChanged = implementerStep ? readStringArray(implementerStep.output, 'filesChanged') : [];
    const [changedPath] = filesChanged;

    const toolCalls: AiProposedToolCall[] = [];
    if (changedPath && includesTool(availableTools, 'inspect_diff')) {
      toolCalls.push({ toolName: 'inspect_diff', arguments: { path: changedPath } });
    }

    const severity: FindingSeverity = 'info';
    const findings = changedPath
      ? [
          {
            id: 'finding-1',
            severity,
            file: changedPath,
            line: 1,
            title: 'Alteração proposta revisada',
            explanation: `A alteração proposta em ${changedPath} é coerente com o objetivo "${objective}".`,
            evidence: 'Patch simulado gerado pelo Implementer nesta mesma execução.',
            suggestedRemediation: 'Aguardar aprovação humana antes de aplicar de verdade (spec §18).',
            status: 'hypothesis' as const,
          },
        ]
      : [
          {
            id: 'finding-1',
            severity,
            file: 'N/A',
            line: 0,
            title: 'Nenhuma alteração de código para revisar',
            explanation: `Nenhum arquivo relevante foi encontrado para o objetivo "${objective}".`,
            evidence: 'O Code Explorer não encontrou arquivos relevantes nesta execução.',
            suggestedRemediation: 'Nenhuma ação necessária.',
            status: 'confirmed' as const,
          },
        ];

    const verdict = changedPath ? 'changes_proposed' : 'no_changes_needed';
    const summary = `Revisão concluída: ${findings.length} finding(s).`;
    const output = { verdict, findings };

    return { summary, toolCalls, output, usage: usageFor(objective, summary + JSON.stringify(output)) };
  }

  private generateDocumentationAgent(request: AiGenerateRequest): AiGenerateResult {
    const { objective, availableTools, repositoryFiles, priorSteps } = request;
    const implementerStep = priorSteps.find((step) => step.role === 'implementer');
    const filesChanged = implementerStep ? readStringArray(implementerStep.output, 'filesChanged') : [];
    const readme = repositoryFiles.find((file) => file.path.toLowerCase() === 'readme.md');

    const toolCalls: AiProposedToolCall[] =
      readme && includesTool(availableTools, 'read_file')
        ? [{ toolName: 'read_file', arguments: { path: readme.path } }]
        : [];

    const summary =
      filesChanged.length > 0
        ? `Documentação revisada para a alteração em ${filesChanged.join(', ')}; nenhuma atualização adicional foi necessária.`
        : 'Nenhuma alteração de código nesta execução — documentação não precisa de revisão.';
    const output = { filesReviewed: readme ? [readme.path] : [], filesChanged: [], summary };

    return { summary, toolCalls, output, usage: usageFor(objective, summary) };
  }
}
