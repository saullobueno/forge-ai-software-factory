# Forge — Status de implementação

Última atualização: 2026-09-24 (continuação autônoma em Codex). Este arquivo existe para que **qualquer sessão futura** (Claude Code ou humana) consiga retomar o trabalho sem precisar reconstruir contexto a partir do zero. Leia isto antes de qualquer coisa; depois confirme contra `git log` e rodando a suíte, porque este arquivo pode ficar desatualizado.

## Como retomar (primeiros passos, nesta ordem)

```bash
pnpm install
pnpm turbo run build lint typecheck test   # deve dar tudo verde antes de continuar
git log --oneline                           # confira se há commits depois do último listado abaixo
git status --short                          # confira se não há trabalho não commitado de uma sessão anterior
```

Último commit confirmado antes desta continuação: **`8a1b3cf`** ("docs: add PROGRESS.md handoff for session pause"). A árvore de trabalho atual contém implementação local ainda não commitada das Fases 8 a 16 — ver seções abaixo e rode a suíte antes de confiar em mudanças posteriores.

Validação final desta continuação (2026-09-24):
- `pnpm turbo run build lint typecheck test` — **34 tasks passaram**.
- `pnpm --filter @forge/api test:e2e` — **10 arquivos / 77 testes passaram**.
- `pnpm --filter @forge/web test:e2e` — **9 testes Playwright passaram**.
- Warnings conhecidos e não bloqueantes: `vite-tsconfig-paths` obsoleto no Vitest da API, warnings `NO_COLOR`/`FORCE_COLOR`, warnings do Turbo sobre tasks de teste sem outputs.

## Fases concluídas e verificadas (0-8), Fases 9-16 iniciadas

Todas verificadas de forma independente (não só pelo autorrelato do agente que implementou): rebuild sem cache (`--force`), suíte e2e completa da API (`pnpm --filter @forge/api test:e2e`), suíte Playwright completa (`cd apps/web && pnpm exec playwright test`), e leitura direta do código nos pontos mais sensíveis (segurança, isolamento de tenant, política de ferramentas).

| Fase | Nome | Commit(s) | O que existe |
|---|---|---|---|
| 0 | Fundação | `adf3bde`, `710bc2d` | Monorepo pnpm/Turborepo, Next.js (`apps/web`), NestJS (`apps/api`), `@forge/database` (Drizzle + PGlite local / Postgres real via `DATABASE_URL`), fila em memória/BullMQ (`QueueModule`), CI, docker-compose.yml, dark mode real (testado em navegador) |
| 1 | Domínio e banco | `b02069f` | `@forge/types` (schemas zod das 31 entidades da spec §16), `@forge/database` (34 tabelas, migrações), `@forge/domain` (máquinas de estado de Task/AgentRun, `decideToolPolicy`) |
| 2 | Auth/RBAC | `d39ece5`, `e3b0ea9`, `3e0ac47` | JWT + cookie httpOnly, RBAC (`hasPermission`, `authorizeToolCall`), isolamento de tenant. `3e0ac47` corrigiu um bug crítico: `apps/api` não conseguia rodar como processo Node real antes disso |
| 3 | Repositório demo | `18249fc`, `9d23555` | `fixtures/acme-platform-web/` (repo TS real com um bug real: `Math.abs()` em `formatCurrency`), seed determinístico completo (org "Acme Platform", projeto, task, agentRun `completed` com 6 steps, diff real, testRun) |
| 4 | Projetos e tarefas (UI) | `9ae93f7` | Login, proxy same-origin (`/api/*`), `/projects`, `/projects/[id]`, `/projects/[id]/tasks/[taskId]`, endpoints REST correspondentes |
| 5 | Inteligência de código | `df9d158` | `/projects/[id]/code`: árvore, viewer Monaco (somente leitura), busca, diff viewer. Proteção contra path traversal testada com arquivo real fora do escopo |
| 6 | Execuções de IA | `7c1d859` | Timeline de execução, cancelamento (transição de estado real), canal de tempo real via SSE (`GET /agent-runs/:id/events`), artefatos |
| 7 | Orquestração de agentes | `2dffa48`, `d415453` | `@forge/ai` (provedor mock determinístico), `@forge/agents` (`AgentRunOrchestrator`, máquina de estados real), fila real consumindo `agentRun`s `queued`. `d415453` corrigiu uma regressão real (teste da Fase 6 ficou "racy" por causa do orquestrador agora processar quase instantaneamente) |
| 8 | Runner/Sandbox | uncommitted | `@forge/sandbox`: interface `SandboxRunner`, `DockerSandboxRunner`, `LocalProcessSandboxRunner`, política de path/env/timeout/kill tree e reuso da heurística destrutiva de `@forge/domain`. Pacote isolado, ainda não conectado ao orquestrador por segurança. |
| 9 | Testes | uncommitted/parcial | `@forge/testing`: núcleo de execução de suites via `SandboxRunner`, status derivado do resultado real do processo, resumo de falha e detecção simples de flaky. Ainda não conectado à API/UI/orquestrador. |
| 10 | Integração Git | uncommitted/isolada | `@forge/git`: contrato `GitProvider`, `MockGitProvider` determinístico em memória e `GitHubGitProvider` como fronteira injetável sem credenciais/chamadas externas. Ainda não conectado à API/UI/orquestrador. |
| 11 | Ambientes | uncommitted/parcial | `EnvironmentsModule` na API (`GET /projects/:id/environments`), UI de ambientes no detalhe do projeto, seed demo aditivo com Development/Preview/Staging/Production e deployments recentes. Deploy real/aprovação protegida ainda pendentes. |
| 12 | Conhecimento | uncommitted/isolada | `@forge/knowledge`: chunking determinístico, recuperação lexical escopada, heurística de prompt injection e wrapper de conhecimento não confiável. Ainda não conectado à persistência/API/UI/agentes. |
| 13 | Playground/avaliação de IA | uncommitted/demo | `AIPlaygroundModule` na API, permissão `ai_playground:use`, avaliação determinística de modelos mock com latência/tokens/custo/JSON/score e UI `/ai-playground`. Sem provedores reais nem histórico persistido. |
| 14 | Segurança/observabilidade | uncommitted/base | `docs/threat-model.md` cobre runner/tools/secrets/Git/contexto IA/exports/realtime; `@forge/agents` emite traces de agent steps/tool calls via `AgentRunTraceSink`; API injeta sink local de logs estruturados com redaction inicial; `/audit-logs` lista eventos tenant-scoped com RBAC; login, iniciar/cancelar agent runs, avaliações do Playground e decisões de política de tool calls gravam audit logs. OpenTelemetry/exporters/dashboards ainda pendentes. |
| 15 | Performance/acessibilidade | uncommitted/base | Layout autenticado com skip link, `main` focalizável e foco visível global; Playwright cobre navegação por teclado; axe cobre rotas autenticadas principais; lint ignora artefatos efêmeros do Playwright. Lighthouse/budgets ainda pendentes. |
| 16 | QA final/documentação | uncommitted/docs | `docs/final-qa-handoff.md` consolida validações, limites conhecidos e ordem sugerida de commits; README/PROGRESS atualizados. |

**O motor central do produto já funciona de ponta a ponta**: login → projeto → tarefa → "Iniciar execução de IA" → orquestrador real processa via fila → timeline atualiza ao vivo via SSE → para em "Aguardando aprovação" quando a política de ferramentas exige (nunca executa `write_file`/`apply_patch`/`run_command`/etc. de verdade contra o host — ver decisão de escopo abaixo).

## Fase 8 — Runner/Sandbox (status: **implementada como pacote isolado, não conectada ao orquestrador**)

Implementado localmente nesta continuação:
- `packages/sandbox` (`@forge/sandbox`) com `SandboxRunner`, `DockerSandboxRunner` e `LocalProcessSandboxRunner`.
- `DockerSandboxRunner.isAvailable()` detecta Docker sem lançar exceção. O teste de execução Docker pula graciosamente quando o daemon não existe.
- `LocalProcessSandboxRunner` confina `cwd` dentro do workspace, aplica timeout, mata árvore de processos, usa env allowlist e bloqueia comandos destrutivos antes de spawnar.
- `@forge/domain` agora exporta `isDestructiveCommandLine()` para runners reutilizarem a mesma política, com cobertura para padrões Unix/Git/SQL e básicos de Windows/PowerShell (`rmdir /s /q`, `del /s /q`, `Remove-Item -Recurse -Force`, `format C:`).
- `.gitignore` ignora `.claude/*.lock`.

**Decisão de escopo deliberada mantida**: NÃO conectar ao orquestrador da Fase 7. `AgentRunOrchestrator`/`real-tool-runner.ts` continuam simulando `write_file`/`apply_patch`/`run_command` como antes. Conectar de verdade exige fluxo de aprovação humana real (Fase 11) e isolamento adequado para código não confiável.

## Fase 9 — Testes (status: **núcleo implementado, integração pendente**)

Implementado localmente nesta continuação:
- `packages/testing` (`@forge/testing`) com `TestSuiteRunner`.
- Suites são executadas por uma implementação de `SandboxRunner`.
- Status é derivado somente do resultado real do sandbox: `passed`, `failed`, `timed_out` ou `blocked`.
- Resumo de falha usa evidência de stdout/stderr sem alterar o resultado real.
- `isFlakyHistory()` detecta histórico com sucesso e falha/timeouts reais.

Ainda falta para considerar a Fase 9 completa:
- Persistir execuções reais em `test_runs`/`test_suites`/`test_artifacts`.
- Expor endpoints/UI para execuções de teste.
- Decidir como instalar dependências/rodar suites do fixture demo de forma segura.
- Só conectar `run_tests` do orquestrador ao runner depois de aprovar o modelo de segurança/aprovação.

## Fase 10 — Integração Git (status: **contrato e providers isolados implementados**)

Implementado localmente nesta continuação:
- `packages/git` (`@forge/git`) com tipos para repositório, branch, commit, diff, checks e pull request.
- Interface `GitProvider`.
- `MockGitProvider` em memória com criação de branch, commit, diff inferido, PR e checks.
- `GitHubGitProvider` delega para um `GitHubGitClient` injetado, deixando a escolha futura de Octokit/app installation tokens fora do domínio.
- Testes usam `node:test` nativo para evitar uma resolução inconsistente do Vitest observada especificamente neste pacote durante a continuação.

Ainda falta para considerar a Fase 10 completa:
- Persistir/vincular operações Git às tabelas existentes (`repositories`, `pull_requests`, `code_changes`, `diffs` etc.).
- Expor endpoints/API e UI para branches/PRs/checks.
- Implementar cliente GitHub real com credenciais seguras.
- Conectar Git ao orquestrador apenas após aprovação humana e política de branch protegida.

## Fase 11 — Ambientes (status: **leitura/API/UI implementadas, deploy real pendente**)

Implementado localmente nesta continuação:
- `apps/api/src/modules/environments`: `EnvironmentsModule`, controller/service/repository.
- Endpoint `GET /projects/:projectId/environments` protegido por `project:read`, com validação UUID -> 404 genérico, tenant scoping no `WHERE`, e seleção segura do usuário do deployment (sem `passwordHash`).
- `packages/database/src/seed/run-seed.ts` cria quatro ambientes demo e deployments associados ao PR mock. O caminho idempotente (`organization` já existente) agora também garante ambientes sem duplicar.
- UI no detalhe do projeto mostra ambientes, URL, proteção, status do último deployment, commit, PR e autor.
- Testes: novo `apps/api/test/environments.e2e-spec.ts`, cobertura no seed integration test e Playwright do fluxo login -> projeto.

Ainda falta para considerar a Fase 11 completa:
- Criar fluxo de criação/execução de deployment.
- Representar approvals de deployments protegidos (`subjectType: "deployment"`) com UI de aprovação/rejeição.
- Conectar ao runner/sandbox ou provider externo real só após decisão de política.
- Adicionar páginas dedicadas/listagens globais de Ambientes, logs e saúde detalhada.

## Fase 12 — Conhecimento (status: **núcleo implementado, integração pendente**)

Implementado localmente nesta continuação:
- `packages/knowledge` (`@forge/knowledge`) com tipos para documentos, escopo de recuperação, chunks preparados e chunks recuperados.
- `chunkKnowledge()` divide documentos por parágrafos, respeita limite estimado de tokens, suporta overlap e marca chunks com risco de prompt injection sem bloquear ingestão.
- `retrieveKnowledge()` faz recuperação lexical determinística por termos, ordena por score e título, e respeita escopo de organização/projeto/workspace antes de pontuar conteúdo.
- `hasPromptInjectionRisk()` detecta padrões óbvios como "ignore previous instructions", tentativa de revelar system prompt e exfiltração de secrets.
- `wrapUntrustedKnowledge()` encapsula contexto recuperado como dado não confiável antes de qualquer uso futuro em prompts.

Ainda falta para considerar a Fase 12 completa:
- Criar indexador real para README/ADRs/docs/issues/convenções do repositório.
- Persistir `knowledge_sources`/`knowledge_chunks` e decidir se haverá embeddings/vector store.
- Expor endpoints/API e UI para consultar, reindexar e auditar conhecimento.
- Conectar aos agentes apenas com wrapper de contexto não confiável e isolamento de tenant testado ponta a ponta.
- Adicionar rastreabilidade de fonte/versão para evitar respostas baseadas em conhecimento obsoleto.

## Fase 13 — Playground/avaliação de IA (status: **modo demo implementado, integração real pendente**)

Implementado localmente nesta continuação:
- `packages/types/src/entities/ai.ts` ganhou schemas/tipos de playground: modelos aceitos, dataset, request de avaliação e resposta com scorecard.
- `@forge/types`/`@forge/domain` ganharam a permissão `ai_playground:use`, restrita a `admin`, `platform_engineer` e `tech_lead`.
- `apps/api/src/modules/ai-playground`: `GET /ai-playground/config` e `POST /ai-playground/evaluations`, protegidos por JWT/RBAC.
- A avaliação é determinística e sem rede: compara `forge-mock-fast`, `forge-mock-balanced` e `forge-mock-reviewer` por score, latência estimada, tokens, custo estimado e validade de JSON.
- `apps/web/src/app/(product)/ai-playground/page.tsx`: UI navegável via sidebar para editar prompt/dataset, selecionar modelos e ver scorecard + outputs por caso.
- Cobertura: e2e da API para config/evaluation/RBAC/validação e Playwright no fluxo real de login -> playground -> comparação -> projetos.

Ainda falta para considerar a Fase 13 completa:
- Chamar provedores reais via adaptadores (`@forge/ai`/Vercel AI SDK) quando credenciais existirem.
- Persistir histórico de avaliações, datasets versionados e resultados em entidades próprias ou `ai_messages`/`ai_usages`.
- Validar outputs contra JSON Schema configurável, não só heurística booleana do modo demo.
- Criar scorecards mais ricos por avaliadores e benchmarks de regressão.
- Expor governança/custo por organização e auditoria de uso.

## Fase 14 — Segurança/observabilidade (status: **base implementada, maturidade pendente**)

Implementado localmente nesta continuação:
- `docs/threat-model.md` com ativos, fronteiras de confiança, cenários de ameaça, mitigações atuais e checklist para fases novas.
- `packages/agents/src/ports.ts` ganhou `AgentRunTraceEvent` e `AgentRunTraceSink`, uma porta mínima para traces sem acoplar o pacote a Nest/OpenTelemetry.
- `AgentRunOrchestrator` emite traces de início/fim para cada agent step, inclusive skipped, e para cada tool call registrada, incluindo status, duração e decisão de política quando aplicável.
- `apps/api/src/modules/agent-runs/agent-run-trace-logger.service.ts` implementa um sink local com logs estruturados opt-in via `FORGE_TRACE_LOGS=1`; `AgentRunWorkerService` injeta esse sink nas execuções reais da fila.
- `apps/api/src/infrastructure/logging/redaction.ts` centraliza uma primeira camada de redaction para chaves sensíveis antes dos logs de trace (`password`, tokens, secrets, cookies, authorization, API/private keys), preservando métricas como `totalTokens`.
- `apps/api/src/modules/audit-logs` expõe `GET /audit-logs` protegido por `audit_log:read`, com actorUser sanitizado e `organizationId` no `WHERE`.
- `apps/api/src/modules/audit-logs/audit-log-writer.module.ts` separa escrita de auditoria da leitura HTTP protegida, permitindo que Auth registre eventos sem ciclo de dependência com `AuditLogsModule`.
- `POST /auth/login` grava `auth.login_succeeded` e `auth.login_failed` para usuários conhecidos, sem registrar senha, token, cookie ou email digitado.
- `POST /tasks/:id/agent-runs` grava `agent_run.triggered`, `POST /agent-runs/:id/cancel` grava `agent_run.cancelled` e `POST /ai-playground/evaluations` grava `ai_playground.evaluated`, todos com ator real (`actorUserId`) e metadados seguros.
- `@forge/agents` ganhou `AgentRunGovernanceSink`; a API implementa `AgentRunGovernanceAuditService` para gravar `agent_run.policy_approval_required`/`agent_run.policy_denied` quando uma tool call exige aprovação ou é negada, sem persistir argumentos/payloads sensíveis no audit log.
- `apps/web/src/app/(product)/audit-logs/page.tsx` adiciona uma tela de auditoria na sidebar; Playwright confirma a navegação e um evento seedado (`agent_run.approved`).
- Teste novo em `packages/agents` garante que steps/tool calls produzem traces sem alterar o resultado da execução.
- E2E focado (`auth.e2e-spec.ts`, `tasks.e2e-spec.ts`, `agent-runs.e2e-spec.ts`, `ai-playground.e2e-spec.ts`) confirma a escrita de audit logs para login/trigger/cancel/playground.
- Playwright de orquestração confirma a trilha `agent_run.policy_approval_required` na tela de Auditoria após uma execução real parar em aprovação.

Ainda falta para considerar a Fase 14 completa:
- Exporter OpenTelemetry real, propagação de trace/span ids e correlação com HTTP/queue.
- Expandir redaction para todos os logs/exporters e revisar payloads sensíveis além dos traces locais.
- Audit log para os demais endpoints mutáveis e decisões de política relevantes.
- Dashboards/alertas de latência, erro, custo de IA, fila, runner e SSE.
- Testes multi-tenant específicos para SSE e exports/downloads.

## Fase 15 — Performance/acessibilidade (status: **base implementada, auditoria ampla pendente**)

Implementado localmente nesta continuação:
- `apps/web/src/app/(product)/layout.tsx` ganhou skip link "Ir para conteúdo" e `main` com `id="conteudo"`/`tabIndex={-1}`.
- `apps/web/src/app/globals.css` ganhou foco visível global para links, botões e campos.
- `apps/web/e2e/accessibility.spec.ts` cobre login real, navegação principal, `main` landmark e ordem de foco por teclado.
- `apps/web/e2e/axe-accessibility.spec.ts` usa `@axe-core/playwright` contra Projetos, Playground IA e Auditoria; a primeira execução apontou metadata scrollável não focável em Auditoria, corrigida com `tabIndex={0}`/rótulo acessível.
- `apps/web/eslint.config.mjs` ignora `test-results/**` e `playwright-report/**`, evitando falhas quando o lint roda perto do Playwright.

Ainda falta para considerar a Fase 15 completa:
- Lighthouse e orçamento de performance/bundle.
- Budgets de bundle/performance e análise de rotas pesadas.
- Testes responsivos mobile/tablet para telas principais.
- Revisão de contraste/semântica em componentes densos como timeline, diffs e scorecards.

## Fase 16 — QA final/documentação (status: **handoff implementado, commit/revisão pendentes**)

Implementado localmente nesta continuação:
- `docs/final-qa-handoff.md` com matriz de validação, áreas implementadas, pontos de atenção, limites deliberados e ordem sugerida de commits.
- `README.md` aponta para `PROGRESS.md`, `docs/threat-model.md` e `docs/final-qa-handoff.md`.
- Este `PROGRESS.md` foi atualizado até a Fase 16.

Ainda falta para fechar operacionalmente:
- Separar commits por fase/tema.
- Revisar diffs grandes antes de abrir PR.
- Rodar e2e novamente se houver qualquer alteração de código depois deste ponto.

## Fases restantes (roadmap, `FORGE-CLAUDE-CODE-PROMPT.md`)

9. Execução de testes — núcleo em `@forge/testing` pronto; falta integração API/UI/persistência
10. Integração Git real — contrato/mock/fronteira GitHub prontos; falta integração API/UI/persistência/cliente real
11. Ambientes — leitura/API/UI/seed prontos; deploy real e approvals protegidas pendentes
12. Conhecimento — núcleo em `@forge/knowledge` pronto; falta indexador, persistência, API/UI, vector store/embeddings e conexão com agentes
13. Playground de IA — modo demo determinístico com API/UI pronto; falta provedores reais, histórico, datasets versionados e evals avançadas
14. Segurança/observabilidade — threat model, tracing local com redaction inicial, leitura de auditoria e audit logs de auth/agent run/playground/política prontos; falta OpenTelemetry/exporters, redaction ampla, audit logs completos e dashboards
15. Performance/acessibilidade — base de navegação por teclado/foco e auditoria axe prontas; falta Lighthouse, budgets e auditoria responsiva
16. QA final/documentação — handoff final pronto; falta separar commits e revisar PR

## Convenções estabelecidas (leia antes de escrever código novo)

- **Sem build step** em `packages/types`, `packages/domain`, `packages/database`, `packages/ai`, `packages/agents`: `main`/`exports` apontam direto pra `src/index.ts`. Imports relativos internos usam extensão `.ts` explícita (não `.js`) — motivo: `apps/api` roda como processo Node real via TypeScript nativo em modo "strip-only", que exige que o import aponte pro arquivo que existe de verdade em disco (ver comentário em `tsconfig.base.json`). **Sempre que mexer nesses pacotes, valide rodando `apps/api` como processo real** (`pnpm --filter @forge/api build && node apps/api/dist/main.js`, ou veja `apps/api/test/runtime-smoke.e2e-spec.ts`) — não confie só em typecheck/Vitest, que mascaram esse tipo de bug (já aconteceu uma vez, Fase 2).
- **Infra local sem credenciais externas**: PGlite no lugar de Postgres real (sem Docker), fila em memória no lugar de Redis, provedor de IA mock determinístico no lugar de Anthropic real. Tudo trocável via env var (`DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`) sem mudar código.
- **Todo endpoint novo em `apps/api`** segue: `*Repository` com `organizationId` embutido no `WHERE` (nunca checagem posterior em memória), `*Service` fino, `*Controller` com `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermission(...)`, 404 genérico idêntico para "não existe" e "existe em outro tenant".
- **Todo teste novo é real**: PGlite de verdade (não mock de Drizzle), supertest contra a API de verdade, Playwright com servidores reais (nunca MSW/mock pros caminhos críticos). Isso já pagou dividendos — achamos bugs reais (path resolution, race conditions, cookies cross-origin) que testes mockados teriam escondido.
- **Processo de trabalho validado nesta sessão**: cada fase = um agente em background (`Agent` tool, `subagent_type: claude`, `run_in_background: true`) com um briefing detalhado (contexto do que já existe, escopo exato, o que NÃO fazer, critério de aceite com verificação real, não só typecheck). Ao terminar, a sessão principal **verifica de forma independente** antes de confiar (rebuild sem cache, rodar as suítes e2e, ler o código dos pontos sensíveis) — isso pegou pelo menos uma regressão real (Fase 7) que o próprio agente não detectou.
- Esta máquina bateu o limite mensal de uso da conta 3 vezes durante a sessão — quando um agente falha com `rate_limit`/429, retome com `SendMessage` usando o `agentId` (não perde contexto) em vez de começar um agente novo do zero.
- Há uma **sessão paralela de outro projeto** ("nexus-developer-platform") rodando nesta máquina, usando as portas 3000-3002 e 5183. Nunca mate processos que não sejam seus; use portas 3100+ para testes/dev manuais.

## Credenciais de demo (após `pnpm --filter @forge/database db:seed`)

Organização "Acme Platform":
- `tech-lead@acme-platform.example` / `demo1234` (role `tech_lead`)
- `dev@acme-platform.example` / `demo1234` (role `developer`)

## Requisito do usuário registrado no prompt mestre

`FORGE-CLAUDE-CODE-PROMPT.md` tem uma regra explícita adicionada pelo usuário: a interface precisa suportar tema claro/escuro com alternância acessível e persistência — já implementado e testado na Fase 0/4.
