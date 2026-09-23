import type { AgentToolName, PolicyDecisionKind } from '@forge/types';

export interface ToolPolicyInput {
  toolName: AgentToolName;
  /**
   * Argumentos brutos da tool call, usados apenas para heurísticas simples
   * de detecção de comandos destrutivos em `run_command`. Nunca contém
   * valores de secrets — spec §18.
   */
  args?: Record<string, unknown>;
}

export interface ToolPolicyDecision {
  decision: PolicyDecisionKind;
  reason: string;
}

/**
 * Ferramentas somente leitura/inspeção — nunca alteram estado e são
 * permitidas por padrão (spec §8).
 */
const ALWAYS_ALLOWED_TOOLS: ReadonlySet<AgentToolName> = new Set([
  'list_files',
  'read_file',
  'search_code',
  'inspect_git',
  'get_issue',
  'get_project_rules',
  'inspect_diff',
  'run_tests',
  'create_branch',
]);

/**
 * Ferramentas que escrevem código, executam comandos ou abrem PRs — exigem
 * aprovação humana por padrão (spec §8, §18).
 */
const REQUIRE_APPROVAL_TOOLS: ReadonlySet<AgentToolName> = new Set([
  'write_file',
  'apply_patch',
  'run_command',
  'create_commit',
  'create_pull_request',
]);

/**
 * Heurística mínima para bloquear comandos reconhecidamente destrutivos
 * mesmo antes de chegar à etapa de aprovação. O motor de políticas
 * completo e configurável por organização é uma fase futura — isto é só a
 * fundação exigida pela spec §18 ("comandos potencialmente destrutivos são
 * bloqueados por padrão").
 */
const DESTRUCTIVE_COMMAND_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\s+\/(?!\S)/i,
  /\brm\s+-rf\s+\*/i,
  /\bdrop\s+(table|database)\b/i,
  /\bgit\s+push\b.*--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
];

function isDestructiveCommand(args: Record<string, unknown> | undefined): boolean {
  const command = args?.['command'];
  if (typeof command !== 'string') return false;
  return DESTRUCTIVE_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

/**
 * Decide a política para uma única tool call com base em regras estáticas
 * e explícitas. Nunca aprova automaticamente uma ação destrutiva — na
 * dúvida (ferramenta não classificada), nega por padrão (fail-closed).
 */
export function decideToolPolicy(input: ToolPolicyInput): ToolPolicyDecision {
  const { toolName, args } = input;

  if (toolName === 'run_command' && isDestructiveCommand(args)) {
    return {
      decision: 'deny',
      reason: 'Comando reconhecido como destrutivo e bloqueado por padrão.',
    };
  }

  if (ALWAYS_ALLOWED_TOOLS.has(toolName)) {
    return {
      decision: 'allow',
      reason: `Ferramenta "${toolName}" é somente leitura/inspeção.`,
    };
  }

  if (REQUIRE_APPROVAL_TOOLS.has(toolName)) {
    return {
      decision: 'require_approval',
      reason: `Ferramenta "${toolName}" altera código, repositório ou executa comandos e exige aprovação humana por padrão.`,
    };
  }

  return {
    decision: 'deny',
    reason: `Ferramenta "${toolName}" não possui regra de política definida.`,
  };
}
