import { authorizeToolCall, hashPassword } from '@forge/domain';
import { chunkKnowledge } from '@forge/knowledge';
import type { AgentRole, KnowledgeSourceKind } from '@forge/types';
import { and, eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '../client.ts';
import {
  agentRuns,
  agents,
  agentSteps,
  approvals,
  auditLogs,
  codeChanges,
  deployments,
  diffs,
  environments,
  fileSnapshots,
  knowledgeChunks,
  knowledgeSources,
  notifications,
  organizations,
  projects,
  pullRequests,
  repositories,
  tasks,
  testArtifacts,
  testRuns,
  testSuites,
  toolCalls,
  users,
  workspaces,
} from '../schema/index.ts';
import { DEMO_AGENT_STEP_ORDER } from './agent-run-timeline.ts';
import { DEMO_BUGGY_FILE_PATH, loadDemoCurrencyBugDiff } from './fixtures.ts';
import { DEMO_TASK_STATUS_TIMELINE } from './task-status-timeline.ts';
import { toolCallStatusForPolicyDecision } from './tool-call-policy.ts';

/**
 * Senha de demonstração para os usuários seedados — projeto de portfólio
 * local, sem dados sensíveis reais. Documentada em `README.md`.
 */
export const DEMO_PASSWORD = 'demo1234';

/**
 * `.data/artifacts` na raiz do monorepo — a mesma raiz de armazenamento
 * lida por `ArtifactStorageService` em `apps/api` (Fase 6). Cada pacote
 * calcula `REPO_ROOT` de forma independente a partir da própria
 * profundidade em disco (mesmo padrão de `FIXTURE_ROOT` em `fixtures.ts` e
 * de `REPO_ROOT` em `repository-fs.service.ts`) — não há um pacote
 * compartilhado só para essa constante. `packages/database/src/seed/` está
 * 4 níveis abaixo da raiz (`seed` -> `src` -> `database` -> `packages`),
 * daí o `../../../../`. `.data/` já está no `.gitignore` da raiz.
 */
const currentSeedDir = dirname(fileURLToPath(import.meta.url));
const SEED_REPO_ROOT = join(currentSeedDir, '..', '..', '..', '..');
const ARTIFACTS_ROOT = join(SEED_REPO_ROOT, '.data', 'artifacts');

/**
 * Grava em disco o conteúdo real por trás de um `testArtifact.storageKey`
 * (Fase 6 — sem isso, `GET /artifacts/:id/content` responderia 404 para um
 * artefato que existe no banco mas nunca teve bytes reais em lugar
 * nenhum). `storageKey` já é o caminho relativo a `ARTIFACTS_ROOT` — mesmo
 * valor que `ArtifactStorageService.resolveWithinRoot` resolve do lado da
 * API.
 */
async function writeDemoArtifactFile(storageKey: string, content: string): Promise<void> {
  const absolutePath = join(ARTIFACTS_ROOT, storageKey);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
}

export type SeedSummary =
  | { alreadySeeded: true; organizationId: string }
  | {
      alreadySeeded: false;
      organizationId: string;
      techLeadUserId: string;
      developerUserId: string;
      platformEngineerUserId: string;
      projectId: string;
      repositoryId: string;
      demoTaskId: string;
      workspaceId: string;
      agentRunId: string;
      codeChangeId: string;
      diffId: string;
      testRunId: string;
      pullRequestId: string;
      approvalId: string;
    };

function timestampAt(baseMs: number, offsetMs: number): Date {
  return new Date(baseMs + offsetMs);
}

/**
 * Configuração fixa por papel (spec §8): ferramentas permitidas e conteúdo
 * de input/output determinístico usado pelos 6 `agentSteps` da execução
 * demo. Mantido fora de `runSeed` para ficar legível — cada papel é uma
 * etapa real do pipeline "corrigir o bug de sinal em formatCurrency", não
 * um placeholder.
 */
function buildAgentRoleCatalog(): Record<
  AgentRole,
  { name: string; description: string; allowedTools: string[] }
> {
  return {
    planner: {
      name: 'Planner',
      description:
        'Decompõe a tarefa em um plano de execução verificável antes de qualquer alteração de código.',
      allowedTools: ['get_issue', 'get_project_rules', 'list_files', 'read_file', 'search_code', 'inspect_git'],
    },
    code_explorer: {
      name: 'Code Explorer',
      description: 'Localiza os arquivos e símbolos relevantes no repositório para o objetivo da tarefa.',
      allowedTools: ['list_files', 'read_file', 'search_code', 'inspect_git'],
    },
    implementer: {
      name: 'Implementer',
      description: 'Aplica a alteração de código no escopo definido pelo plano.',
      allowedTools: ['read_file', 'write_file', 'apply_patch', 'list_files', 'search_code', 'create_branch'],
    },
    test_engineer: {
      name: 'Test Engineer',
      description:
        'Executa a suíte de testes e reporta resultados — nunca marca uma execução com testes falhando como aprovada (spec §12).',
      allowedTools: ['run_tests', 'read_file', 'inspect_diff'],
    },
    reviewer: {
      name: 'Reviewer',
      description:
        'Produz findings de revisão com severidade, arquivo/linha, explicação, evidência e remediação sugerida (spec §11).',
      allowedTools: ['inspect_diff', 'read_file', 'search_code', 'inspect_git'],
    },
    documentation_agent: {
      name: 'Documentation Agent',
      description: 'Atualiza documentação e comentários afetados pela alteração.',
      allowedTools: ['read_file', 'write_file', 'list_files', 'search_code'],
    },
  };
}

async function upsertAgentForRole(
  db: Database,
  organizationId: string,
  role: AgentRole,
  config: { name: string; description: string; allowedTools: string[] },
): Promise<{ id: string }> {
  const existing = await db.query.agents.findFirst({
    where: and(eq(agents.organizationId, organizationId), eq(agents.role, role)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(agents)
    .values({
      organizationId,
      role,
      name: config.name,
      description: config.description,
      allowedTools: config.allowedTools,
    })
    .returning();
  if (!created) throw new Error(`Falha ao inserir agent de papel "${role}"`);
  return created;
}

async function ensureDemoEnvironments(db: Database, organizationId: string): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.organizationId, organizationId), eq(projects.slug, 'forge-web-app')),
  });
  if (!project) return;

  const existingEnvironment = await db.query.environments.findFirst({
    where: and(eq(environments.organizationId, organizationId), eq(environments.projectId, project.id)),
  });
  if (existingEnvironment) return;

  const [developer, techLead, pullRequest] = await Promise.all([
    db.query.users.findFirst({
      where: and(eq(users.organizationId, organizationId), eq(users.email, 'dev@acme-platform.example')),
    }),
    db.query.users.findFirst({
      where: and(eq(users.organizationId, organizationId), eq(users.email, 'tech-lead@acme-platform.example')),
    }),
    db.query.pullRequests.findFirst({
      where: and(
        eq(pullRequests.organizationId, organizationId),
        eq(pullRequests.projectId, project.id),
        eq(pullRequests.externalNumber, 42),
      ),
    }),
  ]);

  const [developmentEnvironment, previewEnvironment, stagingEnvironment, productionEnvironment] = await db
    .insert(environments)
    .values([
      {
        organizationId,
        projectId: project.id,
        kind: 'development',
        name: 'Development',
        url: 'https://dev.acme-platform.example',
        isProtected: false,
      },
      {
        organizationId,
        projectId: project.id,
        kind: 'preview',
        name: 'Preview',
        url: 'https://pr-42.acme-platform.example',
        isProtected: false,
      },
      {
        organizationId,
        projectId: project.id,
        kind: 'staging',
        name: 'Staging',
        url: 'https://staging.acme-platform.example',
        isProtected: true,
      },
      {
        organizationId,
        projectId: project.id,
        kind: 'production',
        name: 'Production',
        url: 'https://app.acme-platform.example',
        isProtected: true,
      },
    ])
    .returning();
  if (!developmentEnvironment || !previewEnvironment || !stagingEnvironment || !productionEnvironment) {
    throw new Error('Falha ao garantir environments demo');
  }

  const baseMs = Date.parse('2026-09-18T14:00:00.000Z');
  await db.insert(deployments).values([
    {
      organizationId,
      projectId: project.id,
      environmentId: developmentEnvironment.id,
      pullRequestId: pullRequest?.id ?? null,
      commitSha: 'b7c9f2a-demo-dev',
      status: 'succeeded',
      startedAt: timestampAt(baseMs, 22 * 60 * 1000),
      completedAt: timestampAt(baseMs, 23 * 60 * 1000),
      deployedByUserId: developer?.id ?? null,
    },
    {
      organizationId,
      projectId: project.id,
      environmentId: previewEnvironment.id,
      pullRequestId: pullRequest?.id ?? null,
      commitSha: 'b7c9f2a-demo-preview',
      status: 'succeeded',
      startedAt: timestampAt(baseMs, 23 * 60 * 1000),
      completedAt: timestampAt(baseMs, 24 * 60 * 1000),
      deployedByUserId: developer?.id ?? null,
    },
    {
      organizationId,
      projectId: project.id,
      environmentId: stagingEnvironment.id,
      pullRequestId: pullRequest?.id ?? null,
      commitSha: 'b7c9f2a-demo-staging',
      status: 'succeeded',
      startedAt: timestampAt(baseMs, 25 * 60 * 1000),
      completedAt: timestampAt(baseMs, 27 * 60 * 1000),
      deployedByUserId: techLead?.id ?? null,
    },
    {
      organizationId,
      projectId: project.id,
      environmentId: productionEnvironment.id,
      pullRequestId: pullRequest?.id ?? null,
      commitSha: 'a4f1d0e-demo-prod',
      status: 'succeeded',
      startedAt: timestampAt(baseMs, -48 * 60 * 60 * 1000),
      completedAt: timestampAt(baseMs, -48 * 60 * 60 * 1000 + 90_000),
      deployedByUserId: techLead?.id ?? null,
    },
  ]);
}

async function ensureDemoPlatformEngineer(
  db: Database,
  organizationId: string,
  passwordHash: string,
): Promise<{ id: string }> {
  const existing = await db.query.users.findFirst({
    where: and(eq(users.organizationId, organizationId), eq(users.email, 'platform@acme-platform.example')),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      organizationId,
      email: 'platform@acme-platform.example',
      name: 'Clara Platform',
      role: 'platform_engineer',
      passwordHash,
    })
    .returning();
  if (!created) throw new Error('Falha ao inserir o platform engineer de seed');
  return created;
}

/**
 * `admin` demo — necessário desde que `environment:approve_deployment`
 * (decisão sobre o gate de deploy protegido, spec §13) passou a ser
 * restrita a `admin`, deliberadamente separada de `environment:deploy`
 * (concedida a `platform_engineer`, que já era o único papel não-admin a
 * solicitar deploys demo) — ver `packages/domain/src/permissions.ts`. Sem
 * este usuário não haveria como demonstrar o fluxo de aprovação de
 * deployment de ponta a ponta com dois papéis distintos.
 */
async function ensureDemoAdmin(db: Database, organizationId: string, passwordHash: string): Promise<{ id: string }> {
  const existing = await db.query.users.findFirst({
    where: and(eq(users.organizationId, organizationId), eq(users.email, 'admin@acme-platform.example')),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({
      organizationId,
      email: 'admin@acme-platform.example',
      name: 'Diego Admin',
      role: 'admin',
      passwordHash,
    })
    .returning();
  if (!created) throw new Error('Falha ao inserir o admin de seed');
  return created;
}

interface DemoKnowledgeDocument {
  kind: KnowledgeSourceKind;
  title: string;
  uri: string;
  version: string;
  content: string;
}

const DEMO_KNOWLEDGE_DOCUMENTS: readonly DemoKnowledgeDocument[] = [
  {
    kind: 'adr',
    title: 'ADR-001 Arquitetura modular do Forge',
    uri: 'demo://forge-web-app/adr/001-arquitetura-modular',
    version: '2026-09-18',
    content:
      'O Forge é organizado como monorepo TypeScript com apps Next.js e NestJS, além de pacotes compartilhados para database, domain, ai, agents, sandbox, knowledge e types.\n\n' +
      'A regra central de arquitetura é manter contratos compartilhados em @forge/types, lógica reutilizável em packages/* e superfícies HTTP nos módulos NestJS. Repositórios sempre filtram por organizationId no WHERE para preservar isolamento multi-tenant.\n\n' +
      'Em desenvolvimento local, PGlite é usado como banco padrão. Em produção, a decisão prevista é Postgres gerenciado, Redis/Upstash para filas e deploy separado para web/API.',
  },
  {
    kind: 'code_rules',
    title: 'Regras de código do Forge Web App',
    uri: 'demo://forge-web-app/rules/code',
    version: '2026-09-18',
    content:
      'Manter mudanças pequenas e testáveis. Preferir APIs tipadas, schemas Zod e validação explícita de entrada.\n\n' +
      'No frontend, buscar dados com TanStack Query, invalidar caches após mutações e preservar UX de erro/carregamento. Não duplicar lógica de autorização do backend: a UI pode esconder ações por UX, mas a segurança fica nos guards.\n\n' +
      'No backend, todo endpoint de projeto precisa validar UUID, confirmar pertencimento à organização atual e responder 404 genérico para recursos fora do tenant.',
  },
  {
    kind: 'readme',
    title: 'README operacional do repositório demo',
    uri: 'demo://forge-web-app/readme',
    version: '2026-09-24',
    content:
      'Contas demo: tech-lead@acme-platform.example, dev@acme-platform.example, platform@acme-platform.example e admin@acme-platform.example, todas com senha demo1234.\n\n' +
      'Fluxos já demonstráveis: login, listagem de projetos/tarefas, execução de agente seedada, exploração de código, playground de IA mock, auditoria, ambientes e solicitação de deployment com aprovação em produção.\n\n' +
      'Sem Docker local por preferência do projeto. Validação de produção será feita no final com serviços gerenciados como Neon, Vercel, Render e Upstash.',
  },
  {
    kind: 'repository_doc',
    title: 'Handoff de QA e continuidade',
    uri: 'demo://forge-web-app/docs/final-qa-handoff',
    version: '2026-09-24',
    content:
      'O handoff atual registra que builds, lint, typecheck e testes direcionados passam. A suíte agregada pode sofrer timeout em PGlite quando múltiplos pacotes disputam banco em paralelo; rodar database isolado confirma estabilidade.\n\n' +
      'Próximas frentes: conectar conhecimento persistido aos agentes, substituir mocks por provedores reais, configurar produção sem Docker local e completar aprovações operacionais.',
  },
];

async function ensureDemoKnowledge(db: Database, organizationId: string): Promise<void> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.organizationId, organizationId), eq(projects.slug, 'forge-web-app')),
  });
  if (!project) return;

  for (const document of DEMO_KNOWLEDGE_DOCUMENTS) {
    const existing = await db.query.knowledgeSources.findFirst({
      where: and(
        eq(knowledgeSources.organizationId, organizationId),
        eq(knowledgeSources.projectId, project.id),
        eq(knowledgeSources.uri, document.uri),
      ),
      with: { chunks: true },
    });

    const source =
      existing ??
      (
        await db
          .insert(knowledgeSources)
          .values({
            organizationId,
            projectId: project.id,
            workspaceId: null,
            kind: document.kind,
            title: document.title,
            uri: document.uri,
            version: document.version,
          })
          .returning()
      )[0];
    if (!source) throw new Error(`Falha ao inserir knowledge source "${document.title}"`);
    if (existing && existing.chunks.length > 0) continue;

    await db.insert(knowledgeChunks).values(
      chunkKnowledge({
        sourceId: source.id,
        content: document.content,
        maxTokens: 120,
        overlapTokens: 16,
      }).map((chunk) => ({
        knowledgeSourceId: chunk.knowledgeSourceId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.tokenCount,
      })),
    );
  }
}

/**
 * Popula um cenário completo e coerente de demonstração (spec §21): 1
 * organization, 2 users, 1 project, o repositório demo
 * "acme-platform-web" com uma issue/tarefa real (bug de formatação de
 * moeda), workspace, snapshots de arquivo antes/depois, diff real,
 * execução de agente completa (6 steps + tool calls com política real),
 * testes passando, PR mergeado, aprovação, notificações e auditoria.
 *
 * Idempotente: a existência da organization "acme-platform" é o único
 * gate — todo o resto do grafo só é criado na primeira chamada, seguindo o
 * mesmo padrão da Fase 1.
 */
export async function runSeed(db: Database): Promise<SeedSummary> {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, 'acme-platform'),
  });
  if (existing) {
    const demoPasswordHash = await hashPassword(DEMO_PASSWORD);
    await ensureDemoPlatformEngineer(db, existing.id, demoPasswordHash);
    await ensureDemoAdmin(db, existing.id, demoPasswordHash);
    await ensureDemoEnvironments(db, existing.id);
    await ensureDemoKnowledge(db, existing.id);
    return { alreadySeeded: true, organizationId: existing.id };
  }

  const [organization] = await db
    .insert(organizations)
    .values({ name: 'Acme Platform', slug: 'acme-platform' })
    .returning();
  if (!organization) throw new Error('Falha ao inserir a organization de seed');

  const demoPasswordHash = await hashPassword(DEMO_PASSWORD);

  const [techLead] = await db
    .insert(users)
    .values({
      organizationId: organization.id,
      email: 'tech-lead@acme-platform.example',
      name: 'Ana Tech Lead',
      role: 'tech_lead',
      passwordHash: demoPasswordHash,
    })
    .returning();
  if (!techLead) throw new Error('Falha ao inserir o tech lead de seed');

  const [developer] = await db
    .insert(users)
    .values({
      organizationId: organization.id,
      email: 'dev@acme-platform.example',
      name: 'Bruno Developer',
      role: 'developer',
      passwordHash: demoPasswordHash,
    })
    .returning();
  if (!developer) throw new Error('Falha ao inserir o developer de seed');

  const platformEngineer = await ensureDemoPlatformEngineer(db, organization.id, demoPasswordHash);
  await ensureDemoAdmin(db, organization.id, demoPasswordHash);

  const [project] = await db
    .insert(projects)
    .values({
      organizationId: organization.id,
      name: 'Forge Web App',
      slug: 'forge-web-app',
      description: 'Monorepo TypeScript de demonstração do Forge (Fase 3).',
      techProfile: {
        languages: ['typescript'],
        frameworks: ['next.js', 'nestjs'],
        packageManager: 'pnpm',
      },
    })
    .returning();
  if (!project) throw new Error('Falha ao inserir o project de seed');

  await db.insert(tasks).values([
    {
      organizationId: organization.id,
      projectId: project.id,
      title: 'Configurar autenticação de usuários',
      description: 'Adicionar login/registro com sessão persistida.',
      acceptanceCriteria: 'Usuário consegue logar e permanecer autenticado entre sessões.',
      priority: 'high',
      labels: ['auth', 'backend'],
      assigneeId: developer.id,
      status: 'ready',
    },
    {
      organizationId: organization.id,
      projectId: project.id,
      title: 'Revisar arquitetura de filas',
      description: 'Avaliar uso de BullMQ vs. fila em memória em produção.',
      acceptanceCriteria: 'ADR documentando a decisão.',
      priority: 'medium',
      labels: ['arquitetura'],
      assigneeId: techLead.id,
      status: 'backlog',
    },
  ]);

  // --- Fase 3: repositório demo, issue/tarefa e execução de agente ----

  const [repository] = await db
    .insert(repositories)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      provider: 'mock',
      owner: 'acme-platform',
      name: 'acme-platform-web',
      defaultBranch: 'main',
      url: 'mock://acme-platform/acme-platform-web',
    })
    .returning();
  if (!repository) throw new Error('Falha ao inserir o repository de seed');

  // A sequência completa é validada em task-status-timeline.test.ts via
  // canTransitionTaskStatus/transitionTaskStatus — aqui só usamos o status
  // final ("done"), que é o resultado dessa sequência real.
  const demoTaskFinalStatus = DEMO_TASK_STATUS_TIMELINE.at(-1);
  if (!demoTaskFinalStatus) throw new Error('DEMO_TASK_STATUS_TIMELINE vazio');

  const [demoTask] = await db
    .insert(tasks)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      title: 'Estornos aparecem como cobrança positiva na fatura',
      description:
        'Clientes que recebem estorno parcial (ex.: downgrade de plano no meio do ciclo) veem o valor do ' +
        'estorno exibido como uma cobrança positiva no resumo da fatura, em vez de um valor negativo/crédito. ' +
        `Causa raiz: ${DEMO_BUGGY_FILE_PATH} aplica Math.abs() antes de formatar o valor, descartando o sinal ` +
        'de qualquer amountInCents negativo.',
      acceptanceCriteria:
        'formatCurrency(amountInCents, currency) preserva o sinal negativo para estornos/créditos ' +
        '(ex.: formatCurrency(-1234, "BRL") === "-R$ 12,34"); formatInvoiceSummary mostra o estorno com sinal ' +
        'negativo no resumo da fatura; suíte de testes existente continua passando e cobre o caso negativo.',
      priority: 'high',
      labels: ['bug', 'billing', 'frontend'],
      assigneeId: developer.id,
      status: demoTaskFinalStatus,
    })
    .returning();
  if (!demoTask) throw new Error('Falha ao inserir a task demo de seed');

  const [workspace] = await db
    .insert(workspaces)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      repositoryId: repository.id,
      taskId: demoTask.id,
      branchName: 'fix/currency-formatting-negative-values',
      worktreePath: '/workspaces/acme-platform-web/fix-currency-formatting-negative-values',
      status: 'archived',
    })
    .returning();
  if (!workspace) throw new Error('Falha ao inserir o workspace de seed');

  const roleCatalog = buildAgentRoleCatalog();
  const agentsByRole: Record<AgentRole, { id: string }> = {
    planner: await upsertAgentForRole(db, organization.id, 'planner', roleCatalog.planner),
    code_explorer: await upsertAgentForRole(db, organization.id, 'code_explorer', roleCatalog.code_explorer),
    implementer: await upsertAgentForRole(db, organization.id, 'implementer', roleCatalog.implementer),
    test_engineer: await upsertAgentForRole(db, organization.id, 'test_engineer', roleCatalog.test_engineer),
    reviewer: await upsertAgentForRole(db, organization.id, 'reviewer', roleCatalog.reviewer),
    documentation_agent: await upsertAgentForRole(
      db,
      organization.id,
      'documentation_agent',
      roleCatalog.documentation_agent,
    ),
  };

  const baseMs = Date.parse('2026-09-18T14:00:00.000Z');

  const [agentRun] = await db
    .insert(agentRuns)
    .values({
      organizationId: organization.id,
      taskId: demoTask.id,
      agentId: agentsByRole.planner.id,
      workspaceId: workspace.id,
      status: 'completed',
      objective:
        'Corrigir o bug de formatação de moeda que faz estornos aparecerem como cobrança positiva em ' +
        DEMO_BUGGY_FILE_PATH,
      scope: {
        repository: 'acme-platform/acme-platform-web',
        allowedPaths: [
          DEMO_BUGGY_FILE_PATH,
          'src/lib/format-currency.test.ts',
          'src/lib/invoice.ts',
          'src/lib/invoice.test.ts',
        ],
        allowedTools: [
          'get_issue',
          'get_project_rules',
          'list_files',
          'read_file',
          'search_code',
          'apply_patch',
          'run_tests',
          'inspect_diff',
        ],
      },
      startedAt: timestampAt(baseMs, 0),
      completedAt: timestampAt(baseMs, 7 * 60 * 1000),
      totalTokens: 11300,
      totalCostUsd: '0.033900',
    })
    .returning();
  if (!agentRun) throw new Error('Falha ao inserir o agentRun de seed');

  const demoDiff = loadDemoCurrencyBugDiff();

  const [beforeSnapshot] = await db
    .insert(fileSnapshots)
    .values({
      organizationId: organization.id,
      workspaceId: workspace.id,
      path: demoDiff.path,
      contentHash: demoDiff.beforeHash,
      sizeBytes: demoDiff.beforeSizeBytes,
      capturedAt: timestampAt(baseMs, 45 * 1000),
    })
    .returning();
  if (!beforeSnapshot) throw new Error('Falha ao inserir o fileSnapshot "antes" de seed');

  const [afterSnapshot] = await db
    .insert(fileSnapshots)
    .values({
      organizationId: organization.id,
      workspaceId: workspace.id,
      path: demoDiff.path,
      contentHash: demoDiff.afterHash,
      sizeBytes: demoDiff.afterSizeBytes,
      capturedAt: timestampAt(baseMs, 4 * 60 * 1000),
    })
    .returning();
  if (!afterSnapshot) throw new Error('Falha ao inserir o fileSnapshot "depois" de seed');

  const [codeChange] = await db
    .insert(codeChanges)
    .values({
      organizationId: organization.id,
      workspaceId: workspace.id,
      agentRunId: agentRun.id,
      filePath: demoDiff.path,
      changeType: 'modified',
      beforeSnapshotId: beforeSnapshot.id,
      afterSnapshotId: afterSnapshot.id,
    })
    .returning();
  if (!codeChange) throw new Error('Falha ao inserir o codeChange de seed');

  const [diff] = await db
    .insert(diffs)
    .values({
      organizationId: organization.id,
      codeChangeId: codeChange.id,
      patch: demoDiff.patch,
      additions: demoDiff.additions,
      deletions: demoDiff.deletions,
    })
    .returning();
  if (!diff) throw new Error('Falha ao inserir o diff de seed');

  // --- agentSteps (1 por papel) + toolCalls -----------------------------

  const stepContentByRole: Record<
    AgentRole,
    { name: string; durationMs: number; tokens: number; costUsd: string; input: Record<string, unknown>; output: Record<string, unknown> }
  > = {
    planner: {
      name: 'Planejar correção do bug de sinal em formatCurrency',
      durationMs: 45_000,
      tokens: 1_800,
      costUsd: '0.005400',
      input: {
        taskId: demoTask.id,
        title: demoTask.title,
        acceptanceCriteria: demoTask.acceptanceCriteria,
        repository: 'acme-platform/acme-platform-web',
      },
      output: {
        plan: [
          'Reproduzir o bug com um teste cobrindo formatCurrency de valor negativo',
          'Localizar a chamada Math.abs() em src/lib/format-currency.ts',
          'Remover Math.abs() e confirmar que Intl.NumberFormat preserva o sinal',
          'Rodar a suíte de testes e revisar o diff antes de abrir o PR',
        ],
        filesToInspect: [DEMO_BUGGY_FILE_PATH, 'src/lib/format-currency.test.ts', 'src/lib/invoice.ts'],
        estimatedRisk: 'low',
      },
    },
    code_explorer: {
      name: 'Localizar formatCurrency e seus usos',
      durationMs: 90_000,
      tokens: 3_200,
      costUsd: '0.009600',
      input: {
        objective: 'Localizar a implementação de formatCurrency e todos os pontos que a chamam',
        repository: 'acme-platform/acme-platform-web',
      },
      output: {
        filesFound: [DEMO_BUGGY_FILE_PATH, 'src/lib/invoice.ts', 'src/index.ts'],
        relevantSnippet: 'const amount = Math.abs(amountInCents) / 100;',
        usages: [{ file: 'src/lib/invoice.ts', symbol: 'formatCurrency' }],
      },
    },
    implementer: {
      name: 'Remover Math.abs() em formatCurrency',
      durationMs: 120_000,
      tokens: 2_600,
      costUsd: '0.007800',
      input: {
        file: DEMO_BUGGY_FILE_PATH,
        instruction: 'Remover Math.abs() para preservar o sinal de valores negativos (estornos/créditos).',
      },
      output: {
        filesChanged: [DEMO_BUGGY_FILE_PATH],
        summary:
          'Removida a chamada Math.abs(); Intl.NumberFormat já formata corretamente o sinal negativo.',
        diffAdditions: demoDiff.additions,
        diffDeletions: demoDiff.deletions,
      },
    },
    documentation_agent: {
      name: 'Revisar documentação afetada pela mudança',
      durationMs: 60_000,
      tokens: 900,
      costUsd: '0.002700',
      input: {
        files: ['README.md', DEMO_BUGGY_FILE_PATH],
        instruction: 'Verificar se a documentação do módulo descreve corretamente o comportamento para valores negativos.',
      },
      output: {
        filesReviewed: ['README.md', DEMO_BUGGY_FILE_PATH],
        filesChanged: [],
        summary:
          'O comentário JSDoc de formatCurrency já documentava o comportamento esperado para valores ' +
          'negativos; nenhuma documentação desatualizada encontrada.',
      },
    },
    test_engineer: {
      name: 'Rodar suíte de testes',
      durationMs: 35_000,
      tokens: 700,
      costUsd: '0.002100',
      input: {
        command: 'vitest run',
        paths: ['src/lib/format-currency.test.ts', 'src/lib/invoice.test.ts'],
      },
      output: {
        status: 'passed',
        suites: [
          { name: 'src/lib/format-currency.test.ts', passed: 4, failed: 0 },
          { name: 'src/lib/invoice.test.ts', passed: 2, failed: 0 },
        ],
      },
    },
    reviewer: {
      name: 'Revisar diff e produzir findings',
      durationMs: 50_000,
      tokens: 2_100,
      costUsd: '0.006300',
      input: {
        codeChangeId: codeChange.id,
        diffPath: demoDiff.path,
      },
      output: {
        verdict: 'approve',
        summary:
          'Fix mínimo e correto: remove Math.abs() e a suíte de testes cobre explicitamente o caso de ' +
          'valor negativo. Sem findings críticos ou altos.',
        // Não existe tabela dedicada a "findings" no schema (spec §16) — o
        // reviewer persiste o array estruturado (severidade, arquivo/linha,
        // explicação, evidência, remediação — spec §11) dentro do jsonb
        // `agentSteps.output`, já que é saída específica desse step.
        findings: [
          {
            id: 'finding-1',
            severity: 'info',
            file: DEMO_BUGGY_FILE_PATH,
            line: 23,
            title: 'Correção do bug de sinal confirmada',
            explanation:
              'Math.abs() foi removido; Intl.NumberFormat formata corretamente o sinal de valores negativos.',
            evidence:
              'O diff remove "Math.abs(amountInCents)" e substitui por "amountInCents"; ' +
              'format-currency.test.ts adiciona o caso "preserva o sinal negativo em estornos".',
            suggestedRemediation: 'Nenhuma ação necessária.',
            status: 'confirmed',
          },
          {
            id: 'finding-2',
            severity: 'low',
            file: DEMO_BUGGY_FILE_PATH,
            line: 3,
            title: 'Falta de teste explícito para a moeda EUR',
            explanation:
              'A função suporta EUR (LOCALE_BY_CURRENCY) mas nenhum teste cobre esse branch — não é um ' +
              'problema confirmado pela mudança atual, apenas uma lacuna de cobertura preexistente.',
            evidence: 'format-currency.test.ts só exercita "BRL" e "USD".',
            suggestedRemediation: 'Adicionar um teste para formatCurrency(amount, "EUR") em um PR futuro.',
            status: 'hypothesis',
          },
        ],
      },
    },
  };

  const actorRoleForToolCalls = 'developer' as const;

  type PendingToolCall = {
    toolName: Parameters<typeof authorizeToolCall>[0]['toolName'];
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  };

  const toolCallsByRole: Partial<Record<AgentRole, PendingToolCall[]>> = {
    planner: [
      { toolName: 'get_issue', args: { taskId: demoTask.id }, result: { id: demoTask.id, title: demoTask.title, status: demoTask.status } },
      {
        toolName: 'get_project_rules',
        args: { projectId: project.id },
        result: { rules: 'Manter cobertura de teste para bibliotecas de formatação; nunca remover casos de teste existentes.' },
      },
    ],
    code_explorer: [
      { toolName: 'list_files', args: { path: 'src/lib' }, result: { files: ['format-currency.ts', 'format-currency.test.ts', 'invoice.ts', 'invoice.test.ts'] } },
      { toolName: 'read_file', args: { path: DEMO_BUGGY_FILE_PATH }, result: { path: DEMO_BUGGY_FILE_PATH, linesRead: 27, bugLine: 'const amount = Math.abs(amountInCents) / 100;' } },
      { toolName: 'search_code', args: { query: 'Math.abs(' }, result: { query: 'Math.abs(', matches: [{ file: DEMO_BUGGY_FILE_PATH, line: 23 }] } },
    ],
    implementer: [
      {
        toolName: 'apply_patch',
        args: { path: DEMO_BUGGY_FILE_PATH, additions: demoDiff.additions, deletions: demoDiff.deletions },
        result: { path: DEMO_BUGGY_FILE_PATH, additions: demoDiff.additions, deletions: demoDiff.deletions },
      },
    ],
    test_engineer: [
      {
        toolName: 'run_tests',
        args: { command: 'vitest run', paths: ['src/lib/format-currency.test.ts', 'src/lib/invoice.test.ts'] },
        result: { passed: 6, failed: 0, suites: ['src/lib/format-currency.test.ts', 'src/lib/invoice.test.ts'] },
      },
    ],
    reviewer: [
      { toolName: 'inspect_diff', args: { codeChangeId: codeChange.id }, result: { additions: demoDiff.additions, deletions: demoDiff.deletions } },
      { toolName: 'read_file', args: { path: DEMO_BUGGY_FILE_PATH }, result: { path: DEMO_BUGGY_FILE_PATH, purpose: 'confirmar remoção do Math.abs() no diff final' } },
    ],
  };

  let stepOffsetMs = 0;
  for (const role of DEMO_AGENT_STEP_ORDER) {
    const content = stepContentByRole[role];
    const startedAt = timestampAt(baseMs, stepOffsetMs);
    const completedAt = timestampAt(baseMs, stepOffsetMs + content.durationMs);
    stepOffsetMs += content.durationMs + 5_000; // pequeno intervalo entre steps

    const [step] = await db
      .insert(agentSteps)
      .values({
        agentRunId: agentRun.id,
        name: content.name,
        role,
        status: 'succeeded',
        input: content.input,
        output: content.output,
        startedAt,
        completedAt,
        durationMs: content.durationMs,
        tokens: content.tokens,
        costUsd: content.costUsd,
      })
      .returning();
    if (!step) throw new Error(`Falha ao inserir o agentStep de papel "${role}"`);

    for (const pending of toolCallsByRole[role] ?? []) {
      const authorization = authorizeToolCall({
        actor: { role: actorRoleForToolCalls, organizationId: organization.id },
        resourceOrganizationId: organization.id,
        toolName: pending.toolName,
        args: pending.args,
      });
      const status = toolCallStatusForPolicyDecision(authorization.decision);

      await db.insert(toolCalls).values({
        agentStepId: step.id,
        toolName: pending.toolName,
        arguments: pending.args,
        result: { ...pending.result, policyDecision: authorization },
        status,
        startedAt,
        completedAt,
      });
    }
  }

  // --- Testes, PR, aprovação, notificações e auditoria -------------------

  const [testRun] = await db
    .insert(testRuns)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      workspaceId: workspace.id,
      agentRunId: agentRun.id,
      triggeredByUserId: developer.id,
      status: 'passed',
      startedAt: timestampAt(baseMs, stepOffsetMs - 40_000),
      completedAt: timestampAt(baseMs, stepOffsetMs - 5_000),
      durationMs: 35_000,
    })
    .returning();
  if (!testRun) throw new Error('Falha ao inserir o testRun de seed');

  await db.insert(testSuites).values([
    {
      testRunId: testRun.id,
      name: 'src/lib/format-currency.test.ts',
      status: 'passed',
      passedCount: 4,
      failedCount: 0,
      skippedCount: 0,
      durationMs: 22_000,
      isFlaky: false,
    },
    {
      testRunId: testRun.id,
      name: 'src/lib/invoice.test.ts',
      status: 'passed',
      passedCount: 2,
      failedCount: 0,
      skippedCount: 0,
      durationMs: 13_000,
      isFlaky: false,
    },
  ]);

  const artifactStorageKey = `demo/acme-platform-web/test-runs/${testRun.id}/vitest-run.log`;
  const artifactLogContent =
    '$ vitest run src/lib/format-currency.test.ts src/lib/invoice.test.ts\n\n' +
    ' RUN  v2.1.9 acme-platform-web\n\n' +
    ' ✓ src/lib/format-currency.test.ts (4 tests) 22ms\n' +
    '   ✓ formatCurrency > formata valores positivos em BRL\n' +
    '   ✓ formatCurrency > formata valores positivos em USD\n' +
    '   ✓ formatCurrency > preserva o sinal negativo em estornos/créditos\n' +
    '   ✓ formatCurrency > lança para moeda não suportada\n' +
    ' ✓ src/lib/invoice.test.ts (2 tests) 13ms\n' +
    '   ✓ formatInvoiceSummary > resume itens e total\n' +
    '   ✓ formatInvoiceSummary > mostra estorno com sinal negativo\n\n' +
    ' Test Files  2 passed (2)\n' +
    '      Tests  6 passed (6)\n' +
    '   Start at  ' +
    timestampAt(baseMs, stepOffsetMs - 40_000).toISOString() +
    '\n' +
    '   Duration  35ms\n';

  const [testArtifact] = await db
    .insert(testArtifacts)
    .values({
      testRunId: testRun.id,
      kind: 'log',
      name: 'vitest-run.log',
      storageKey: artifactStorageKey,
      sizeBytes: Buffer.byteLength(artifactLogContent, 'utf8'),
    })
    .returning();
  if (!testArtifact) throw new Error('Falha ao inserir o testArtifact de seed');

  await writeDemoArtifactFile(artifactStorageKey, artifactLogContent);

  const [pullRequest] = await db
    .insert(pullRequests)
    .values({
      organizationId: organization.id,
      projectId: project.id,
      repositoryId: repository.id,
      workspaceId: workspace.id,
      taskId: demoTask.id,
      provider: 'mock',
      externalNumber: 42,
      externalUrl: 'mock://acme-platform/acme-platform-web/pull/42',
      title: 'fix(billing): preservar sinal negativo em formatCurrency para estornos',
      // O schema (Fase 1) não tem pull_requests.diff_id — o vínculo com o
      // Diff é indireto, via workspace -> codeChange -> diff (mesma
      // workspaceId desta PR). Documentado aqui em vez de alterar o schema
      // de uma fase já concluída.
      description:
        `Corrige ${DEMO_BUGGY_FILE_PATH}: remove Math.abs() para que estornos e créditos sejam exibidos ` +
        `com o sinal negativo correto. +${demoDiff.additions}/-${demoDiff.deletions}. Testes: 6/6 passando.`,
      sourceBranch: workspace.branchName,
      targetBranch: repository.defaultBranch,
      status: 'merged',
      mergedAt: timestampAt(baseMs, stepOffsetMs + 10 * 60 * 1000),
    })
    .returning();
  if (!pullRequest) throw new Error('Falha ao inserir o pullRequest de seed');

  const [developmentEnvironment, previewEnvironment, stagingEnvironment, productionEnvironment] = await db
    .insert(environments)
    .values([
      {
        organizationId: organization.id,
        projectId: project.id,
        kind: 'development',
        name: 'Development',
        url: 'https://dev.acme-platform.example',
        isProtected: false,
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        kind: 'preview',
        name: 'Preview',
        url: 'https://pr-42.acme-platform.example',
        isProtected: false,
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        kind: 'staging',
        name: 'Staging',
        url: 'https://staging.acme-platform.example',
        isProtected: true,
      },
      {
        organizationId: organization.id,
        projectId: project.id,
        kind: 'production',
        name: 'Production',
        url: 'https://app.acme-platform.example',
        isProtected: true,
      },
    ])
    .returning();
  if (!developmentEnvironment || !previewEnvironment || !stagingEnvironment || !productionEnvironment) {
    throw new Error('Falha ao inserir environments de seed');
  }

  await db.insert(deployments).values([
    {
      organizationId: organization.id,
      projectId: project.id,
      environmentId: developmentEnvironment.id,
      pullRequestId: pullRequest.id,
      commitSha: 'b7c9f2a-demo-dev',
      status: 'succeeded',
      startedAt: timestampAt(baseMs, stepOffsetMs + 11 * 60 * 1000),
      completedAt: timestampAt(baseMs, stepOffsetMs + 12 * 60 * 1000),
      deployedByUserId: developer.id,
    },
    {
      organizationId: organization.id,
      projectId: project.id,
      environmentId: previewEnvironment.id,
      pullRequestId: pullRequest.id,
      commitSha: 'b7c9f2a-demo-preview',
      status: 'succeeded',
      startedAt: timestampAt(baseMs, stepOffsetMs + 12 * 60 * 1000),
      completedAt: timestampAt(baseMs, stepOffsetMs + 13 * 60 * 1000),
      deployedByUserId: developer.id,
    },
    {
      organizationId: organization.id,
      projectId: project.id,
      environmentId: stagingEnvironment.id,
      pullRequestId: pullRequest.id,
      commitSha: 'b7c9f2a-demo-staging',
      status: 'succeeded',
      startedAt: timestampAt(baseMs, stepOffsetMs + 14 * 60 * 1000),
      completedAt: timestampAt(baseMs, stepOffsetMs + 16 * 60 * 1000),
      deployedByUserId: techLead.id,
    },
    {
      organizationId: organization.id,
      projectId: project.id,
      environmentId: productionEnvironment.id,
      pullRequestId: pullRequest.id,
      commitSha: 'a4f1d0e-demo-prod',
      status: 'succeeded',
      startedAt: timestampAt(baseMs, stepOffsetMs - 48 * 60 * 60 * 1000),
      completedAt: timestampAt(baseMs, stepOffsetMs - 48 * 60 * 60 * 1000 + 90_000),
      deployedByUserId: techLead.id,
    },
  ]);

  await ensureDemoKnowledge(db, organization.id);

  const approvalReason =
    'Diff mínimo e correto; testes passando (6/6); revisão sem findings críticos ou altos — aprovado para merge.';

  const [approval] = await db
    .insert(approvals)
    .values({
      organizationId: organization.id,
      subjectType: 'agent_run',
      subjectId: agentRun.id,
      status: 'approved',
      requestedByUserId: developer.id,
      approvedByUserId: techLead.id,
      reason: approvalReason,
      decidedAt: timestampAt(baseMs, stepOffsetMs + 8 * 60 * 1000),
    })
    .returning();
  if (!approval) throw new Error('Falha ao inserir a approval de seed');

  await db.insert(notifications).values([
    {
      organizationId: organization.id,
      userId: techLead.id,
      kind: 'approval_requested',
      title: `Aprovação necessária: execução de IA na tarefa "${demoTask.title}"`,
      body: 'A execução de IA aplicou o fix e os testes passaram; aguardando aprovação para concluir.',
      isRead: true,
      relatedEntityType: 'agent_run',
      relatedEntityId: agentRun.id,
    },
    {
      organizationId: organization.id,
      userId: developer.id,
      kind: 'agent_run_completed',
      title: 'Execução de IA concluída',
      body: `A execução de IA para "${demoTask.title}" foi concluída e aprovada.`,
      isRead: true,
      relatedEntityType: 'agent_run',
      relatedEntityId: agentRun.id,
    },
    {
      organizationId: organization.id,
      userId: techLead.id,
      kind: 'pull_request_review_requested',
      title: 'Revisão de PR solicitada',
      body: pullRequest.title,
      isRead: true,
      relatedEntityType: 'pull_request',
      relatedEntityId: pullRequest.id,
    },
  ]);

  await db.insert(auditLogs).values([
    {
      organizationId: organization.id,
      actorType: 'agent',
      action: 'code_change.applied',
      targetType: 'code_change',
      targetId: codeChange.id,
      metadata: {
        file: demoDiff.path,
        additions: demoDiff.additions,
        deletions: demoDiff.deletions,
        agentRunId: agentRun.id,
      },
    },
    {
      organizationId: organization.id,
      actorType: 'agent',
      action: 'pull_request.created',
      targetType: 'pull_request',
      targetId: pullRequest.id,
      metadata: { sourceBranch: workspace.branchName, targetBranch: repository.defaultBranch },
    },
    {
      organizationId: organization.id,
      actorType: 'user',
      actorUserId: techLead.id,
      action: 'agent_run.approved',
      targetType: 'agent_run',
      targetId: agentRun.id,
      metadata: { reason: approvalReason },
    },
  ]);

  return {
    alreadySeeded: false,
    organizationId: organization.id,
    techLeadUserId: techLead.id,
    developerUserId: developer.id,
    platformEngineerUserId: platformEngineer.id,
    projectId: project.id,
    repositoryId: repository.id,
    demoTaskId: demoTask.id,
    workspaceId: workspace.id,
    agentRunId: agentRun.id,
    codeChangeId: codeChange.id,
    diffId: diff.id,
    testRunId: testRun.id,
    pullRequestId: pullRequest.id,
    approvalId: approval.id,
  };
}
