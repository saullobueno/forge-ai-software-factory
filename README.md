# Forge — Fábrica de Software com IA

Monorepo do Forge, conforme `FORGE-SPECIFICATION.md` (produto) e `FORGE-CLAUDE-CODE-PROMPT.md` (prompt de implementação).

## Stack

pnpm + Turborepo · Next.js/React/TypeScript/Tailwind · NestJS · Drizzle ORM (Postgres) · BullMQ/Redis · Vitest · Vercel AI SDK.

## Estrutura

```
apps/
  web/        Next.js (App Router) — frontend
  api/        NestJS — backend (auth/RBAC, projects)
packages/
  types/      Schemas Zod e tipos compartilhados (inclui Permission, MemberRole)
  domain/     Lógica de domínio pura (RBAC, política de ferramentas, hash de senha)
  database/   Schema Drizzle + client (Postgres real ou PGlite local)
  sandbox/    Runner isolado (Docker quando disponível, fallback local controlado)
  testing/    Núcleo de execução/análise de suites usando SandboxRunner
  git/        Contratos Git, provider mock determinístico e fronteira GitHub injetável
  knowledge/  Chunking, recuperação lexical e defesa contra prompt injection em contexto RAG
```

Novos pacotes (`code-intelligence`, `policies`, `ui`) e apps (`runner`, `docs`) serão adicionados conforme as fases do roadmap avançam — ver `FORGE-CLAUDE-CODE-PROMPT.md`.

## Decisões de infraestrutura local (sem Docker)

Nesta máquina o Docker não está instalado. Para não bloquear o desenvolvimento, quatro decisões foram tomadas:

1. **Banco de dados**: sem `DATABASE_URL` definido, o `@forge/database` usa [PGlite](https://pglite.dev) — um Postgres real compilado para WASM, embarcado no processo, sem instalação nenhuma. O arquivo local default fica em `<repo>/.data/forge-dev.pglite`, independente do diretório de onde API, migrations ou seed rodam. O mesmo schema Drizzle roda sem alterações contra um Postgres real (`pg`) assim que `DATABASE_URL` for definido — por exemplo, Neon/Render Postgres em staging/produção.
2. **Fila/Redis**: sem `REDIS_URL` definido, a API usa uma fila em memória (`InMemoryQueueAdapter`, mesma interface do BullMQ). Com `REDIS_URL` definido, passa a usar `BullMqQueueAdapter` (BullMQ + ioredis) automaticamente.
3. **IA**: nenhuma chave de provedor foi configurada. Até que `ANTHROPIC_API_KEY` (ou similar) seja definida, os agentes de IA (Fase 7) usam um adaptador mock determinístico, alinhado ao modo demo descrito na spec (§21).
4. **Runner/Sandbox**: `@forge/sandbox` fornece `DockerSandboxRunner` e `LocalProcessSandboxRunner`. O fallback local é útil para desenvolvimento sem Docker, mas não é isolamento de kernel; por isso segue desacoplado do orquestrador até existir fluxo de aprovação humana para ações reais.

Banco e fila reais não exigem mudança de código quando a infraestrutura estiver disponível — apenas variáveis de ambiente. Provider de IA real e runner seguro para comandos/testes ainda são frentes próprias de implementação. Ver `.env.example`, `.env.production.example` e [docs/production-deployment.md](docs/production-deployment.md).

## Como rodar

```bash
pnpm install
pnpm dev          # apps/web em :3000, apps/api em :3001
```

```bash
pnpm build         # build de todos os apps/pacotes
pnpm lint          # lint em todo o monorepo
pnpm typecheck     # typecheck em todo o monorepo
pnpm test          # testes unitários/integração em todo o monorepo
```

## Banco de dados

```bash
pnpm --filter @forge/database db:generate   # gera migrações a partir do schema
pnpm db:migrate                              # aplica migrações (Postgres real ou PGlite local)
pnpm --filter @forge/database db:seed        # popula "Acme Platform" com usuários, demo, ambientes e conhecimento
```

## Como abrir a UI demo

Para ver a experiência completa sem Docker local, use o PGlite/fila em memória do modo dev:

```bash
pnpm db:migrate
pnpm --filter @forge/database db:seed
pnpm dev
```

Depois abra `http://localhost:3000`. A raiz redireciona para `/projects`; sem sessão, o proxy encaminha para `/login`.

Credenciais de demo:

- `tech-lead@acme-platform.example` / `demo1234` — vê Projetos, Playground IA, Auditoria e aprova execuções.
- `platform@acme-platform.example` / `demo1234` — gerencia ambientes e solicita deployments.
- `dev@acme-platform.example` / `demo1234` — perfil de desenvolvedor com permissões mais restritas.
- `admin@acme-platform.example` / `demo1234` — superusuário; único papel que decide o gate de aprovação de deployments protegidos.

Rotas úteis para navegar após login:

- `/projects`
- `/projects/[id]`
- `/projects/[id]/tasks/[taskId]`
- `/ai-playground`
- `/audit-logs`

## Autenticação/RBAC (Fase 2)

- `POST /auth/login` (`{ email, password }`) retorna um JWT no corpo (`token`) e também como cookie `httpOnly` (`forge_session`, `sameSite=lax`, `secure` apenas em produção). `GET /auth/me` é protegido e retorna o usuário autenticado (sem hash de senha).
- **Credenciais de demo** (após `pnpm --filter @forge/database db:seed`, organização "Acme Platform"):
  - `tech-lead@acme-platform.example` / `demo1234` (role `tech_lead`)
  - `platform@acme-platform.example` / `demo1234` (role `platform_engineer`)
  - `dev@acme-platform.example` / `demo1234` (role `developer`)
  - `admin@acme-platform.example` / `demo1234` (role `admin`)
- `JWT_SECRET` (ver `.env.example`) tem um default óbvio e inseguro (`dev-insecure-secret-change-me`) só para não bloquear `pnpm dev` local — **defina um valor real antes de qualquer deploy**.
- RBAC: `packages/domain` define uma matriz `MemberRole -> Permission[]` fechada (`hasPermission`) e `authorizeToolCall`, que compõe isolamento de tenant + RBAC + a política de ferramentas da Fase 1 (`decideToolPolicy`) numa única decisão. Em `apps/api`, `JwtAuthGuard` + `PermissionsGuard` (decorator `@RequirePermission(...)`) aplicam isso a nível de rota — ver `GET /projects/:id` como referência mínima de isolamento de tenant de ponta a ponta.

## Projetos e Tarefas (Fase 4)

- **Proxy same-origin**: `apps/web` e `apps/api` são origens diferentes (`:3000`/`:API_PORT`) — o cookie `httpOnly forge_session` não atravessa fetch cross-origin. `apps/web/next.config.ts` usa `rewrites()` para repassar `/api/*` (chamado pelo browser na mesma origem do Next.js) para a API real, via a env var `API_INTERNAL_URL` (default `http://127.0.0.1:3001`). Ver `.env.example`.
- **UI**: `/login` (React Hook Form + Zod, reusa `loginRequestSchema` de `@forge/types`), layout autenticado com sidebar (`apps/web/src/app/(product)/layout.tsx` — só "Projetos" é navegável; o resto da Arquitetura de Informação da spec §3 aparece esmaecido), `/projects` (lista paginada), `/projects/[id]` (detalhe: perfil tecnológico, notas de arquitetura, regras de código, tarefas) e `/projects/[id]/tasks/[taskId]` (detalhe da tarefa, dependências e botão "Iniciar execução de IA").
- **Proteção de rotas**: `apps/web/src/proxy.ts` (Next.js 16 renomeou `middleware.ts` para `proxy.ts` — mesma função) checa só a presença do cookie `forge_session` e redireciona para `/login`; é uma checagem otimista, a validação de verdade continua sendo feita pela API a cada chamada — `apps/web/src/lib/api-client.ts` redireciona para `/login` em qualquer 401.
- **Estado de servidor**: TanStack Query (`@tanstack/react-query`) para todas as chamadas à API a partir de Client Components.
- **Endpoints novos em `apps/api`** (mesmo padrão de tenant scoping + RBAC de `GET /projects/:id`): `GET /projects` (paginado, `project:read`), `GET /projects/:id/tasks` (com dependências, `project:read`), `GET /tasks/:id` (`task:read`), `POST /tasks/:id/agent-runs` (`agent_run:trigger`) — cria um `agentRun` em `status: "queued"` para um agente existente da organização (`planner`, com fallback para o primeiro agente habilitado). Nenhum step é processado — o orquestrador de verdade é a Fase 7; a execução fica parada em fila, exatamente como a spec §9 descreve o primeiro estado do ciclo.
- **Pegadinha real de `next build`/`rewrites()`**: o Next.js resolve `rewrites()` e grava o destino resolvido em `.next/routes-manifest.json` **no momento do `next build`** — `next start` só reproduz esse manifest, nunca reavalia `next.config.ts`. Definir `API_INTERNAL_URL` apenas na hora de rodar `next start` (sem rebuildar antes com essa env var já presente) não tem efeito nenhum. `apps/web/playwright.config.ts` faz isso corretamente (rebuild encadeado antes do `next start` do e2e); qualquer outro ambiente (staging, deploy) que precise de uma API_INTERNAL_URL diferente do default precisa rodar `next build` com a env var já definida.

## Regras de engenharia

Ver `FORGE-CLAUDE-CODE-PROMPT.md` — TypeScript strict, arquitetura em camadas, ferramentas de agente tipadas com autorização server-side, comandos de IA nunca executados diretamente no host, e tema claro/escuro obrigatório na interface.

## Runner e Testes (Fases 8/9)

- `@forge/sandbox` expõe uma interface `SandboxRunner`, `DockerSandboxRunner` com limites de CPU/memória/rede/timeout e `LocalProcessSandboxRunner` com confinamento por workspace, timeout com kill de árvore de processos, env allowlist e política de comandos destrutivos compartilhada com `@forge/domain`.
- `@forge/testing` executa suites via `SandboxRunner`, deriva status apenas do resultado real do processo (`exitCode`, timeout ou bloqueio de política), gera resumo de falha e detecta histórico flaky simples.
- Estes pacotes ainda **não estão conectados** ao orquestrador da Fase 7. Essa conexão deve esperar uma decisão explícita de produto/segurança sobre aprovação humana e isolamento real para código não confiável.

## Git (Fase 10)

- `@forge/git` define a interface `GitProvider` para branches, commits, diffs, pull requests e checks.
- `MockGitProvider` mantém estado em memória para modo demo e testes.
- `GitHubGitProvider` é só uma fronteira injetável por enquanto; nenhuma credencial externa ou chamada real ao GitHub é usada.

## Ambientes (Fase 11)

- `GET /projects/:id/environments` lista ambientes e deployments recentes do projeto com o mesmo isolamento de tenant dos módulos anteriores.
- A página de detalhe de projeto mostra Development/Preview/Staging/Production, URL, proteção e último deployment.
- `POST /projects/:projectId/environments/:environmentId/deployments` solicita um deployment demo para papéis com `environment:deploy`.
- Ambientes não protegidos criam um deployment `succeeded` imediatamente no modo demo; ambientes protegidos criam um deployment `queued` e uma linha `approvals.pending` (`subjectType: "deployment"`), além de audit logs `deployment.requested`/`deployment.approval_required`.
- O seed demo é aditivo: se a organização "Acme Platform" já existir, `db:seed` garante os ambientes sem duplicar dados.
- A UI mostra o botão "Solicitar deploy" para `platform_engineer`/`admin` e exibe o gate "Aguardando aprovação" quando o último deployment protegido está pendente.
- `POST .../deployments/:deploymentId/approve`/`reject` decide o gate — restrito a `environment:approve_deployment`, uma permissão nova e deliberadamente **diferente** de `environment:deploy`: hoje só `platform_engineer`/`admin` solicitam deploy, e se a aprovação reaproveitasse a mesma permissão, `platform_engineer` poderia aprovar o próprio pedido. `environment:approve_deployment` fica restrita só a `admin` (ver `packages/domain/src/permissions.ts`). Aprovação conclui o deployment como `succeeded` (mesma simulação demo já usada por ambientes não-protegidos); rejeição conclui como `failed`. Audit logs `deployment.approved`/`deployment.rejected`. Ainda não há execução real em Render/Vercel — a etapa atual cobre solicitação, gate, decisão e auditoria.

## Conhecimento (Fase 12)

- `@forge/knowledge` implementa a base isolada para ingestão/recuperação de conhecimento: chunking determinístico com overlap, estimativa simples de tokens, detecção heurística de prompt injection e wrapper explícito de conteúdo não confiável.
- `retrieveKnowledge()` faz recuperação lexical escopada por organização/projeto/workspace e nunca retorna conteúdo fora do escopo solicitado.
- O seed demo persiste 4 fontes em `knowledge_sources`/`knowledge_chunks` para o projeto "Forge Web App": ADR de arquitetura, regras de código, README operacional e handoff de QA.
- `GET /projects/:id/knowledge` lista fontes/chunks/tokens com isolamento de tenant e `GET /projects/:id/knowledge/search?q=...` retorna chunks recuperados com `wrappedContent` seguro para uso futuro por agentes.
- A tela `/projects/[id]` mostra a seção "Conhecimento" com fontes indexadas e busca contextual.
- Ainda não há indexador automático de repositório/docs, embeddings/vector store ou conexão direta da recuperação com o orquestrador de agentes.

## Playground de IA (Fase 13)

- `GET /ai-playground/config` retorna catálogo de modelos mock e dataset padrão; `POST /ai-playground/evaluations` compara modelos com latência, tokens, custo estimado, validade de output estruturado e score.
- A permissão `ai_playground:use` fica restrita a `admin`, `platform_engineer` e `tech_lead`.
- A UI `/ai-playground` permite editar prompt/dataset, selecionar modelos e visualizar scorecard sem chamadas externas ou custo real.
- Ainda não há provedores reais, histórico persistido, datasets versionados, embeddings/evals avançadas ou comparação com saídas reais de agentes.

## Segurança e Observabilidade (Fase 14)

- [docs/threat-model.md](docs/threat-model.md) registra o threat model inicial para runner, tools, secrets, Git, contexto de IA, exports e canais realtime.
- `@forge/agents` agora emite traces estruturados para início/fim de agent steps e tool calls por meio de uma porta `AgentRunTraceSink`.
- `apps/api` injeta um sink local (`AgentRunTraceLoggerService`) que escreve eventos de trace como logs estruturados quando `FORGE_TRACE_LOGS=1`, aplicando redaction inicial de chaves sensíveis antes do log.
- `GET /audit-logs` e `/audit-logs` expõem leitura tenant-scoped dos eventos de auditoria para papéis com `audit_log:read`, sem vazar `passwordHash` do ator.
- `POST /auth/login`, `POST /tasks/:id/agent-runs`, `POST /agent-runs/:id/cancel` e `POST /ai-playground/evaluations` gravam audit logs com ator, alvo e metadados seguros (`auth.login_succeeded`, `auth.login_failed`, `agent_run.triggered`, `agent_run.cancelled`, `ai_playground.evaluated`).
- Decisões de política de tool calls que exigem aprovação ou são negadas também geram auditoria (`agent_run.policy_approval_required`/`agent_run.policy_denied`) sem registrar argumentos, patches ou conteúdo de arquivos.
- Ainda falta exporter OpenTelemetry real, redaction completa em todos os logs/exporters, cobertura de audit log para os demais endpoints mutáveis e dashboards/alertas.

## Performance e Acessibilidade (Fase 15)

- O layout autenticado tem skip link para o conteúdo principal, `main` identificável e foco visível consistente para links, botões e campos.
- Em viewports estreitos, a navegação autenticada vira um drawer mobile com foco gerenciado e Escape para fechar; o conteúdo principal usa largura mínima segura para evitar overflow horizontal em telas reais de telefone/tablet.
- Playwright cobre login -> layout autenticado -> navegação por teclado até o conteúdo.
- `@axe-core/playwright` roda auditoria automatizada nas rotas autenticadas principais e em estados densos: scorecard do Playground IA e timeline de execução com steps/findings/tool calls expandidos.
- `lighthouse-budgets.spec.ts` roda Lighthouse real em sessão autenticada contra `/projects`, `/projects/[id]/code` e timeline de execução, com budgets de performance/acessibilidade/best-practices. Os relatórios HTML locais ficam em `apps/web/lighthouse-reports/` e são ignorados pelo Git.
- O lint do web ignora `test-results/**` e `playwright-report/**`, evitando corrida contra artefatos efêmeros do Playwright.
- Ainda falta monitoramento contínuo em CI para budgets de bundle por chunk e refinamentos adicionais por viewport nas telas futuras.

## QA e Handoff (Fase 16)

- [PROGRESS.md](PROGRESS.md) é o mapa principal de retomada.
- [docs/final-qa-handoff.md](docs/final-qa-handoff.md) consolida validações, limites conhecidos e ordem sugerida de commits.
