import type { AgentToolName } from '@forge/types';
import type {
  ProjectRulesContext,
  RepositoryContext,
  RepositoryFileContent,
  RepositoryReader,
  TaskContext,
} from './ports.ts';

export interface SimulatedPatch {
  path: string;
  patch: string;
  additions: number;
  deletions: number;
}

export interface RealToolContext {
  /** `null` quando o projeto não tem repositório configurado — degrada graciosamente em vez de falhar a execução inteira. */
  root: string | null;
  repositoryFiles: readonly RepositoryFileContent[];
  repositoryReader: RepositoryReader;
  task: TaskContext;
  projectRules: ProjectRulesContext | null;
  repository: RepositoryContext | null;
  /** Patch simulado proposto pelo `implementer` nesta mesma execução, se houver — usado por `inspect_diff`. */
  implementerPatch: SimulatedPatch | null;
}

export interface RealToolExecution {
  ok: boolean;
  result: Record<string, unknown>;
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug.length > 0 ? slug.slice(0, 60) : 'tarefa';
}

function countTestCases(content: string): number {
  const matches = content.match(/\b(it|test)\s*\(/g);
  return matches ? matches.length : 0;
}

/**
 * Executa de verdade uma ferramenta que `decideToolPolicy` classificou
 * como `allow` (spec §8: `list_files`, `read_file`, `search_code`,
 * `inspect_git`, `get_issue`, `get_project_rules`, `inspect_diff`,
 * `run_tests`, `create_branch`) contra o repositório demo em disco e os
 * dados reais da tarefa/projeto já carregados pelo orquestrador. Nunca
 * chamada para `write_file`/`apply_patch`/`run_command`/`create_commit`/
 * `create_pull_request` — essas nunca chegam a `allow` (sempre
 * `require_approval`), então o `default` abaixo nunca é exercitado em
 * produção; existe só para fail-closed caso o catálogo de políticas mude
 * no futuro sem este arquivo ser atualizado.
 *
 * `run_tests` e `create_branch` são "reais" no sentido de que seus
 * argumentos/resultado vêm de dados genuínos (conteúdo de teste realmente
 * lido, título real da tarefa) — nenhum processo de teste ou comando git é
 * de fato executado (Fase 8 — runner sandbox — e Fase 10 — adaptador de
 * Git — são fases futuras).
 */
export async function executeRealTool(
  toolName: AgentToolName,
  args: Record<string, unknown>,
  ctx: RealToolContext,
): Promise<RealToolExecution> {
  switch (toolName) {
    case 'list_files': {
      if (!ctx.root) {
        return { ok: true, result: { tree: [], note: 'Nenhum repositório configurado para este projeto.' } };
      }
      const tree = await ctx.repositoryReader.getTree(ctx.root);
      return { ok: true, result: { tree } };
    }

    case 'read_file': {
      const path = args['path'];
      if (!ctx.root || typeof path !== 'string') {
        return { ok: false, result: { error: 'Caminho de arquivo inválido ou repositório não configurado.' } };
      }
      try {
        const file = await ctx.repositoryReader.readFile(ctx.root, path);
        return { ok: true, result: { path: file.path, content: file.content, sizeBytes: file.sizeBytes } };
      } catch {
        return { ok: false, result: { error: `Arquivo não encontrado: ${path}` } };
      }
    }

    case 'search_code': {
      const query = args['query'];
      if (typeof query !== 'string' || query.length === 0) {
        return { ok: true, result: { query: '', matches: [] } };
      }
      const needle = query.toLowerCase();
      const matches = ctx.repositoryFiles
        .filter((file) => file.path.toLowerCase().includes(needle) || file.content.toLowerCase().includes(needle))
        .map((file) => ({ path: file.path }));
      return { ok: true, result: { query, matches } };
    }

    case 'inspect_git': {
      if (!ctx.repository) {
        return { ok: true, result: { note: 'Nenhum repositório configurado para este projeto.' } };
      }
      return {
        ok: true,
        result: {
          owner: ctx.repository.owner,
          name: ctx.repository.name,
          defaultBranch: ctx.repository.defaultBranch,
          note: 'Metadados do repositório mock — sem histórico de commits real nesta fase (Fase 10).',
        },
      };
    }

    case 'get_issue': {
      return {
        ok: true,
        result: {
          id: ctx.task.id,
          title: ctx.task.title,
          description: ctx.task.description,
          acceptanceCriteria: ctx.task.acceptanceCriteria,
        },
      };
    }

    case 'get_project_rules': {
      return {
        ok: true,
        result: {
          codeRules: ctx.projectRules?.codeRules ?? null,
          architectureNotes: ctx.projectRules?.architectureNotes ?? null,
        },
      };
    }

    case 'inspect_diff': {
      if (!ctx.implementerPatch) {
        return { ok: true, result: { note: 'Nenhuma alteração foi proposta nesta execução.' } };
      }
      return { ok: true, result: { ...ctx.implementerPatch } };
    }

    case 'run_tests': {
      const rawPaths = args['paths'];
      const paths = Array.isArray(rawPaths) ? rawPaths.filter((entry): entry is string => typeof entry === 'string') : [];
      const suites = paths.map((path) => {
        const file = ctx.repositoryFiles.find((candidate) => candidate.path === path);
        const passed = file ? countTestCases(file.content) : 0;
        return { name: path, passed, failed: 0 };
      });
      const totalPassed = suites.reduce((total, suite) => total + suite.passed, 0);
      return {
        ok: true,
        result: {
          status: 'passed',
          suites,
          totalPassed,
          totalFailed: 0,
          note:
            'Execução simulada (Fase 7): leitura real dos arquivos de teste, sem um processo de teste real ' +
            '(runner isolado — Fase 8/9).',
        },
      };
    }

    case 'create_branch': {
      const branchName = `feat/${slugify(ctx.task.title)}`;
      return { ok: true, result: { branchName, baseBranch: ctx.repository?.defaultBranch ?? 'main' } };
    }

    default:
      return { ok: false, result: { error: `Ferramenta "${toolName}" não tem execução real implementada.` } };
  }
}
