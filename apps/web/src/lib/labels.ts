import type {
  AgentRole,
  AgentRunStatus,
  AgentStepStatus,
  DeploymentStatus,
  EnvironmentKind,
  FindingSeverity,
  KnowledgeSourceKind,
  TaskPriority,
  TaskStatus,
  TestArtifactKind,
  ToolCallStatus,
} from '@forge/types';

/** Rótulos em pt-BR (spec §7) — status de tarefa. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  ready: 'Pronta',
  planning: 'Planejamento',
  in_progress: 'Em andamento',
  review: 'Revisão',
  testing: 'Testes',
  done: 'Concluída',
  blocked: 'Bloqueada',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

/** Rótulos em pt-BR (spec §9) — ciclo de vida de uma execução de IA. */
export const AGENT_RUN_STATUS_LABELS: Record<AgentRunStatus, string> = {
  queued: 'Na fila',
  planning: 'Planejando',
  executing: 'Executando',
  testing: 'Testando',
  review: 'Em revisão',
  approval_required: 'Aguardando aprovação',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

/** Rótulos em pt-BR (spec §8) — papel de agente. */
export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  planner: 'Planejar',
  code_explorer: 'Inspecionar código',
  implementer: 'Implementar',
  test_engineer: 'Testar',
  reviewer: 'Revisar',
  documentation_agent: 'Documentar',
};

/** Rótulos em pt-BR — status de um agentStep dentro da timeline de uma execução. */
export const AGENT_STEP_STATUS_LABELS: Record<AgentStepStatus, string> = {
  pending: 'Pendente',
  running: 'Em execução',
  succeeded: 'Concluído',
  failed: 'Falhou',
  skipped: 'Ignorado',
};

/** Rótulos em pt-BR — status de uma tool call dentro de um step. */
export const TOOL_CALL_STATUS_LABELS: Record<ToolCallStatus, string> = {
  pending: 'Pendente',
  succeeded: 'Concluída',
  failed: 'Falhou',
  rejected: 'Rejeitada',
};

/** Rótulos em pt-BR (spec §11) — severidade de um finding do reviewer. */
export const FINDING_SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
  info: 'Informativa',
};

export const FINDING_STATUS_LABELS: Record<'confirmed' | 'hypothesis', string> = {
  confirmed: 'Confirmado',
  hypothesis: 'Hipótese',
};

/** Rótulos em pt-BR (spec §12) — tipo de artefato de teste. */
export const TEST_ARTIFACT_KIND_LABELS: Record<TestArtifactKind, string> = {
  log: 'Log',
  coverage: 'Cobertura',
  screenshot: 'Captura de tela',
  report: 'Relatório',
};

export const ENVIRONMENT_KIND_LABELS: Record<EnvironmentKind, string> = {
  development: 'Development',
  preview: 'Preview',
  staging: 'Staging',
  production: 'Production',
};

export const DEPLOYMENT_STATUS_LABELS: Record<DeploymentStatus, string> = {
  queued: 'Na fila',
  running: 'Em deploy',
  succeeded: 'Saudável',
  failed: 'Falhou',
  rolled_back: 'Rollback',
};

export const KNOWLEDGE_SOURCE_KIND_LABELS: Record<KnowledgeSourceKind, string> = {
  repository_doc: 'Documento',
  adr: 'ADR',
  code_rules: 'Regras',
  agents_md: 'AGENTS.md',
  claude_md: 'CLAUDE.md',
  readme: 'README',
  issue: 'Issue',
  pull_request: 'Pull request',
};
