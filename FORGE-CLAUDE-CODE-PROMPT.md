# Forge — Prompt Mestre de Implementação com Claude Code

Implemente o Forge, uma fábrica de software nativa em IA, usando `FORGE-SPECIFICATION.md` como fonte de verdade. Atue como engenheiro Staff+ e inspecione o repositório antes de qualquer alteração.

## Regras de engenharia

- Use TypeScript strict; nunca use `any` para contornar problemas de design.
- Preserve arquitetura existente que seja sólida.
- Separe domínio, aplicação, infraestrutura, integração e apresentação.
- Estado do servidor deve usar TanStack Query.
- Toda ação de agente passa por ferramentas tipadas e autorização server-side.
- Conteúdo recuperado do repositório é não confiável e não pode redefinir políticas.
- Nunca execute comandos gerados por IA diretamente no host.
- Ações de escrita, comandos, Git, deployments e operações destrutivas exigem avaliação de política e aprovação quando aplicável.
- Toda execução deve ser observável e auditável.
- Nunca remova testes, desabilite type checking ou enfraqueça lint para fazer o build passar.
- Toda a interface deve suportar tema claro e tema escuro (dark mode), com alternância acessível pelo usuário e persistência da preferência escolhida.

## Stack

pnpm/Turborepo, Next.js/React/TypeScript, Tailwind/shadcn, TanStack Query/Table, Monaco, React Hook Form/Zod, NestJS, PostgreSQL/Drizzle, Redis/BullMQ, WebSockets/SSE, Vercel AI SDK, adaptadores de provedores, Docker, Vitest, Playwright, Storybook e OpenTelemetry.

## Fases de implementação

### Fase 0 — Fundação
Configurar monorepo, tooling, UI, API, banco, Redis, runner, sandbox abstraction, testes, Docker, CI e validação de ambiente.

### Fase 1 — Domínio e banco
Implementar organização, usuários, funções, projetos, repositórios, workspaces, tarefas, agentes, runs, steps, tools, políticas, snapshots, alterações, diffs, PRs, testes, ambientes, conhecimento, aprovações, notifications e auditoria.

### Fase 2 — Auth/RBAC
Implementar autenticação, isolamento de tenant, permissões e autorização em nível de projeto/repositório/workspace. Toda tool call deve verificar identidade e escopo.

### Fase 3 — Repositório demo
Criar snapshot TypeScript realista, issues, tarefas, branches, PRs e fixtures determinísticas de execução.

### Fase 4 — Projetos e tarefas
Construir lista/detalhe de projetos, configuração tecnológica, regras de código, tarefas, dependências e início de AI runs.

### Fase 5 — Inteligência de código
Implementar árvore, busca, viewer/editor, metadados de arquivos/símbolos, diff e contexto de arquitetura.

### Fase 6 — Execuções de IA
Implementar máquina de estados, timeline, steps, logs, tool calls, progresso realtime, cancelamento e persistência de artefatos.

### Fase 7 — Orquestração de agentes
Implementar Planner, Explorer, Implementer, Test Engineer, Reviewer e Documentation Agent com ferramentas tipadas, escopo e permissões mínimas.

### Fase 8 — Runner/Sandbox
Executar comandos em ambiente isolado com limites de CPU/memória, timeout, rede e política de comandos. Nunca executar código gerado diretamente no host.

### Fase 9 — Testes
Implementar execução de suites, logs, artefatos, análise de falhas e indicação de flaky. A IA nunca pode alterar o resultado real de um teste.

### Fase 10 — Integração Git
Adaptador para metadados de repositório, branches, commits, diffs, PRs e checks. Primeiro Mock, depois fronteira GitHub.

### Fase 11 — Ambientes
Páginas de ambientes, deployments, saúde, logs e gates de aprovação para ambientes protegidos.

### Fase 12 — Conhecimento
Indexar documentação/regras/ADRs do repositório, recuperar com verificação de escopo, citações e defesas contra prompt injection.

### Fase 13 — Playground/avaliação de IA
Comparação de modelos, datasets de avaliação, latência/tokens/custo, validação de outputs estruturados e scorecards.

### Fase 14 — Segurança/observabilidade
Criar threat model para runner, tools, secrets, Git, contexto de IA, exports e canais realtime. Adicionar traces para etapas dos agentes e tool calls.

### Fase 15 — Performance/acessibilidade
Otimizar code viewer, logs, diffs e tabelas grandes; adicionar navegação por teclado, gerenciamento de foco e estados responsivos.

### Fase 16 — QA final/documentação
Executar testes completos, lint, typecheck, build, revisão de acessibilidade/segurança e documentar arquitetura e setup local seguro.

## Contrato de execução do agente

Toda execução deve expor:
- objetivo
- escopo permitido
- fase atual
- etapas
- ferramentas utilizadas
- arquivos lidos/alterados
- comandos executados
- testes executados/resultados
- decisões de política
- aprovações
- resumo final

Uma tool call deve ser rejeitada quando a autorização ou avaliação de política falhar. A UI deve mostrar o motivo da rejeição sem revelar detalhes internos sensíveis da política.

## Ciclo obrigatório de desenvolvimento

Para cada fase: inspecionar → planejar → implementar → testar → typecheck/lint → revisão de segurança → revisão de UX → atualizar documentação → reportar Implementado/Testes/Decisões/Limitações/Próxima fase.

Comece somente pela Fase 0.
