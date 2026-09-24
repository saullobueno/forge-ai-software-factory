# Forge — Status de implementação

Última atualização: 2026-09-24. Este arquivo existe para que **qualquer sessão futura** (Claude Code, Codex, ou humana) consiga retomar o trabalho sem precisar reconstruir contexto do zero. Leia isto antes de qualquer coisa; depois confirme contra `git log` e rodando a suíte, porque este arquivo pode ficar desatualizado.

## Como retomar (primeiros passos, nesta ordem)

```bash
pnpm install
pnpm turbo run build lint typecheck test   # deve dar tudo verde antes de continuar
pnpm --filter @forge/api test:e2e          # rode em sequência, não em paralelo com o Playwright
cd apps/web && pnpm exec playwright test   # o banco de e2e é resetado automaticamente a cada execução
git log --oneline                          # confira se há commits depois do último listado abaixo
git status --short                         # confira se não há trabalho não commitado de uma sessão anterior
```

Último commit confirmado: **`af8ecae`** ("docs: update PROGRESS.md — Phase 18 continuation committed and verified"), mais o trabalho desta sessão (decisão approve/reject para approvals de deployment — ver seção "Fase 11 continuação #2" abaixo), commitado localmente na sequência (não empurrado para o remote — quem revisa decide quando publicar). Todas as Fases 0-18 do roadmap estão commitadas e verificadas — ver tabela abaixo. O repositório também tem um remote real e público: `https://github.com/saullobueno/forge-ai-software-factory` (CI verde, incluindo o teste real do Docker rodando em `ubuntu-latest`).

Validação final confirmada de forma independente (não só pelo autorrelato de quem implementou), depois desta sessão: `pnpm turbo run build lint typecheck test` → **34/34** (com `--force`, sem cache); `pnpm --filter @forge/api test:e2e` → **108/108**; suíte Playwright completa → **16/16**. Duas falhas transitórias apareceram numa rodada intermediária do pipeline agregado (`@forge/sandbox#test` timeout em "interrompe processos que excedem o timeout", `@forge/api#test` hook timeout em `app.controller.spec.ts`) — ambas reproduzidas como flake de contenção de CPU/disco sob carga (mesmo padrão já documentado abaixo), confirmadas como não-regressão rodando cada pacote isolado logo em seguida (19/19 e 8/8, respectivamente). Nenhum dos dois pacotes foi tocado por esta sessão.

Continuação da Fase 15 nesta sessão: o layout autenticado ganhou drawer mobile acessível sem transformar o `layout.tsx` inteiro em Client Component (`ProductShell` concentra o estado interativo); foram adicionados testes responsivos reais para iPhone 13 e iPad Mini, cobertura axe para estados densos (scorecard do Playground IA e timeline com conteúdo expandido) e auditoria Lighthouse real com budgets em sessão autenticada. Scores confirmados no Lighthouse local: `/projects` 99/100/100, `/projects/[id]/code` 91/100/100 e timeline 100/100/100 (performance/accessibility/best-practices).

Validações direcionadas da continuação da Fase 15: `pnpm --filter @forge/web typecheck` → passou; `pnpm --filter @forge/web lint` → passou; `pnpm --filter @forge/api build` → passou; `pnpm --filter @forge/web test:e2e -- responsive.spec.ts` → **2/2** passou; `pnpm --filter @forge/web test:e2e -- axe-accessibility.spec.ts` → **3/3** passou; `pnpm --filter @forge/web test:e2e -- lighthouse-budgets.spec.ts` → **1/1** passou; `pnpm --filter @forge/web test:e2e` completo → **21/21** passou. Na suíte completa, Lighthouse reportou `/projects` 100/100/100, `/projects/[id]/code` 96/100/100 e timeline 100/100/100. Observação: uma primeira tentativa de rodar dois Playwrights em paralelo gerou `EPERM` ao resetar `apps/web/.data/e2e-web`; rodar os specs em sequência resolveu, consistente com a regra já documentada de não disputar PGlite/reset e2e.

## Episódio: sessão paralela retomou o trabalho a partir deste arquivo (2026-09-24)

Depois da Fase 18, o usuário pediu explicitamente para outra sessão (fora desta conversa) se atualizar a partir deste `PROGRESS.md` e continuar. Essa sessão testou o app manualmente no navegador (não só automatizado) e achou + corrigiu bugs reais de uso — ver seção abaixo. Ao retomar esta sessão (Claude), o mesmo protocolo de sempre: `git status --short` primeiro (achou ~20 arquivos não commitados), verificação independente completa (build/lint/typecheck/test + e2e + Playwright, todos verdes, incluindo confirmar que uma falha isolada em `knowledge.e2e-spec.ts` era o mesmo flake de contenção de PGlite já documentado, não uma regressão), leitura do código dos pontos sensíveis (fluxo de deployment, módulo de conhecimento), e separação em commits temáticos antes de dar o retrato ao usuário.

## Trabalho commitado nesta rodada (antes descrito como "não commitado")

O usuário reportou que abrir `http://localhost:3000` mostrava só o placeholder antigo da Fase 0. Correção aplicada nesta sessão: `apps/web/src/app/page.tsx` agora redireciona `/` para `/projects`; sem sessão, o `proxy.ts` encaminha para `/login`. O proxy também passou a proteger `/ai-playground` e `/audit-logs`. O teste `theme-toggle.spec.ts` foi ajustado para entrar por `/login`.

Também foi preparada a frente "produção sem Docker local": `.env.production.example`, `docs/production-deployment.md`, ajustes em `.env.example`/`README.md`, e validação fail-fast em `apps/api/src/infrastructure/config/env.ts` para impedir `NODE_ENV=production` sem `DATABASE_URL`, `REDIS_URL` e `JWT_SECRET` real.

Correção adicional após teste manual do usuário: login local falhava com `Não foi possível entrar.` porque o default antigo de `DATABASE_LOCAL_PATH` era relativo ao diretório de execução. Assim, `pnpm db:migrate`/`db:seed` podiam alimentar um PGlite, enquanto a API dev lia outro (`apps/api/.data/forge-dev.pglite`). `packages/database/src/env.ts` e `packages/database/drizzle.config.ts` agora usam como default absoluto `<repo>/.data/forge-dev.pglite`, independente do CWD. Após parar os processos antigos do Forge, rodar `pnpm db:migrate` + `pnpm --filter @forge/database db:seed` e subir `pnpm dev`, login foi confirmado via API direta e via proxy do Next.

Continuação da Fase 11 nesta sessão: `POST /projects/:projectId/environments/:environmentId/deployments` solicita deployment demo para papéis com `environment:deploy`. Ambientes abertos concluem como `succeeded`; ambientes protegidos ficam `queued` e criam `approvals.pending` (`subjectType: deployment`) com audit logs `deployment.requested`/`deployment.approval_required`. A tela de projeto mostra botão "Solicitar deploy" para `platform_engineer`/`admin` e badge "Aguardando aprovação" quando há gate pendente. Seed agora garante `platform@acme-platform.example` / `demo1234` para testar esta frente.

Continuação da Fase 12 nesta sessão: `knowledge_sources`/`knowledge_chunks` agora são populados pelo seed demo com 4 fontes do projeto "Forge Web App"; `apps/api` ganhou `KnowledgeModule` com `GET /projects/:id/knowledge` e `GET /projects/:id/knowledge/search`; a tela de projeto ganhou a seção "Conhecimento" com fontes indexadas e busca contextual. A recuperação segue lexical via `@forge/knowledge`, escopada por tenant/projeto, com `wrappedContent` para uso futuro seguro por agentes. Ainda não há indexador automático, embeddings/vector store ou conexão direta com o orquestrador.

Nota operacional desta sessão: uma tentativa de rodar `db:seed` enquanto a API dev segurava o PGlite deixou o banco local em estado parcial. A API foi parada, a pasta `.data/forge-dev.pglite` foi preservada em backup (`.data/forge-dev.pglite.backup-20260924-174614`) e a base demo foi recriada com `pnpm --filter @forge/database db:migrate` + `pnpm --filter @forge/database db:seed`. Evite rodar seed/migrate no mesmo PGlite aberto pela API dev.

Validações desta sessão:
- `pnpm --filter @forge/web typecheck` → passou.
- `pnpm --filter @forge/web lint` → passou.
- `pnpm --filter @forge/web test:e2e` → **12/12** passou.
- `pnpm --filter @forge/api test` → **4 arquivos / 8 testes** passaram.
- `pnpm --filter @forge/api lint` → passou.
- `pnpm --filter @forge/api typecheck` → passou.
- `pnpm turbo run build lint typecheck test` → **34/34** passou.
- `pnpm --filter @forge/api test:e2e -- runtime-smoke.e2e-spec.ts` → **1 arquivo / 2 testes** passou.
- Login manual por HTTP: `POST http://127.0.0.1:3001/auth/login` com `tech-lead@acme-platform.example` → passou; `POST http://127.0.0.1:3000/api/auth/login` com `dev@acme-platform.example` → passou.
- Após a correção do caminho default do PGlite: `pnpm --filter @forge/database typecheck` → passou; `pnpm --filter @forge/database lint` → passou; `pnpm --filter @forge/api typecheck` → passou; `pnpm --filter @forge/api test` → **4 arquivos / 8 testes** passaram; `pnpm --filter @forge/database test` com `DATABASE_LOCAL_PATH` temporário → **6 arquivos / 18 testes** passaram.
- Após o fluxo de deployment demo: `pnpm --filter @forge/types typecheck` → passou; `pnpm --filter @forge/api typecheck` → passou; `pnpm --filter @forge/web typecheck` → passou; `pnpm --filter @forge/database typecheck` → passou; `pnpm --filter @forge/api lint` → passou; `pnpm --filter @forge/web lint` → passou; `pnpm --filter @forge/database lint` → passou; `pnpm --filter @forge/api test` → **4 arquivos / 8 testes** passaram; `pnpm --filter @forge/database test -- src/seed/run-seed.integration.test.ts` com PGlite temporário → **1 arquivo / 4 testes** passou; `pnpm --filter @forge/api test:e2e -- environments.e2e-spec.ts` → **1 arquivo / 9 testes** passou; `pnpm --filter @forge/web test:e2e -- environment-deployments.spec.ts` → **1 teste** passou.
- `pnpm turbo run build lint typecheck test` foi tentado após o fluxo de deployment: **31/34 tasks passaram**, mas `@forge/database#test` estourou `beforeAll` (120s) em duas specs PGlite sob carga. Rerun isolado logo em seguida: `pnpm --filter @forge/database test` → **6 arquivos / 18 testes** passaram em 48s. `pnpm --filter @forge/api typecheck`, `pnpm --filter @forge/web typecheck` e `pnpm --filter @forge/web lint` também passaram depois do timeout agregado.
- Após a integração inicial da Fase 12: `pnpm --filter @forge/knowledge typecheck` → passou; `pnpm --filter @forge/knowledge test` → **1 arquivo / 6 testes** passou; `pnpm --filter @forge/api typecheck` → passou; `pnpm --filter @forge/database typecheck` → passou; `pnpm --filter @forge/web typecheck` → passou; `pnpm --filter @forge/api lint` → passou; `pnpm --filter @forge/database lint` → passou; `pnpm --filter @forge/web lint` → passou; `pnpm --filter @forge/api test:e2e -- knowledge.e2e-spec.ts` → **1 arquivo / 7 testes** passou; `pnpm --filter @forge/web test:e2e -- project-knowledge.spec.ts` → **1 teste** passou; verificação manual via proxy `:3000/api` retornou `KNOWLEDGE_COUNT=4` e `SEARCH_COUNT=1`.

Nota: `pnpm --filter @forge/api test:e2e` completo foi tentado depois da mudança de env, mas ficou preso no encerramento sem reportar resultado; o processo foi interrompido e limpo. O runtime-smoke direcionado passou em seguida e cobre a inicialização real do Nest fora do Vitest.

Depois de commitar a Fase 17, a mesma verificação apontou mais um bug real (não relacionado à Fase 17): `packages/sandbox` tinha um teste com `afterEach` chamando `rmSync` imediatamente após matar um processo por timeout — no Windows, o handle do diretório não é liberado de forma síncrona com o kill, causando `EPERM` esporádico sob carga (reproduzido de forma consistente rodando a suíte inteira; sempre passava isolado). Corrigido trocando por `fs/promises.rm` com `maxRetries`/`retryDelay` (`fd68696`).

**Nota de ambiente (Fase 18)**: rodar `pnpm --filter @forge/api test:e2e` EM PARALELO com `pnpm turbo run build lint typecheck test` (que também sobe PGlite via `@forge/database`) nesta máquina produz falhas de `beforeAll` por `hookTimeout` (60s) em specs não relacionadas (`audit-logs.e2e-spec.ts`, `ai-playground.e2e-spec.ts`) por contenção de CPU/disco — sempre passam rodando isolado (confirmado: 89/89 rodando sozinho logo em seguida). Reforça a mesma lição já registrada abaixo sobre não rodar suítes PGlite pesadas em paralelo.

## Histórico da sessão (contexto importante, não repita o erro)

Esta sessão rodou de forma autônoma por ~1 dia inteiro. Em um certo ponto o usuário pediu uma pausa; enquanto isso, **outra ferramenta de IA (Codex) trabalhou no mesmo repositório em paralelo**, usando uma versão anterior deste arquivo como briefing, e implementou as Fases 8-16 de uma vez, tudo não commitado. Ao retomar, a sessão principal (Claude):
1. Revisou o código dos pontos mais sensíveis (execução de comando no sandbox, redaction de logs, isolamento de tenant em endpoints novos) — qualidade sólida, mesmos padrões de segurança já estabelecidos.
2. Rodou a suíte completa e achou **2 bugs reais**, ambos corrigidos e commitados separadamente:
   - `apps/api/test/runtime-smoke.e2e-spec.ts`: margem de timeout curta demais (45s) para `nest start` compilar a frio com o código adicional das Fases 8-16 — ampliada para 90s.
   - `apps/web/e2e/login-to-agent-run.spec.ts`: falha real e reprodutível (não flake) na asserção de audit log — causa raiz era `apps/web/.data/e2e-web/*.pglite` não ser limpo entre execuções da suíte, fazendo o seed idempotente pular a inserção de audit logs num banco já seedado por uma versão antiga do seed. Corrigido com `apps/web/e2e/reset-e2e-db.mjs`, que agora roda antes de cada execução do Playwright.
3. Separou o trabalho em 6 commits temáticos (Fases 8, 9, 10, 12, 11+13+14+15 juntas por causa de arquivos compartilhados, 16).

**Lição**: se outra sessão/ferramenta também estiver trabalhando neste repositório em paralelo, `git status --short` no início de cada retomada é essencial — pode haver trabalho de terceiros não commitado esperando revisão.

## Fases concluídas e verificadas (0-16)

| Fase | Nome | Commit(s) | O que existe |
|---|---|---|---|
| 0 | Fundação | `adf3bde`, `710bc2d` | Monorepo pnpm/Turborepo, Next.js, NestJS, `@forge/database` (Drizzle + PGlite/Postgres real), fila em memória/BullMQ, CI, dark mode real |
| 1 | Domínio e banco | `b02069f` | `@forge/types` (31 entidades), `@forge/database` (34 tabelas), `@forge/domain` (máquinas de estado, `decideToolPolicy`) |
| 2 | Auth/RBAC | `d39ece5`, `e3b0ea9`, `3e0ac47` | JWT + cookie httpOnly, RBAC, isolamento de tenant |
| 3 | Repositório demo | `18249fc`, `9d23555` | `fixtures/acme-platform-web/`, seed determinístico completo |
| 4 | Projetos e tarefas | `9ae93f7` | Login, proxy same-origin, `/projects`, `/projects/[id]`, `/projects/[id]/tasks/[taskId]` |
| 5 | Inteligência de código | `df9d158` | `/projects/[id]/code`: árvore, Monaco, busca, diff |
| 6 | Execuções de IA | `7c1d859` | Timeline, cancelamento, SSE, artefatos |
| 7 | Orquestração de agentes | `2dffa48`, `d415453` | `@forge/ai` (mock), `@forge/agents` (`AgentRunOrchestrator`), fila real |
| 8 | Runner/Sandbox | `29c2acf` | `@forge/sandbox`: Docker + fallback local. **Não conectado ao orquestrador** (ver seção abaixo) |
| 9 | Testes | `ce73e88` | `@forge/testing`: `TestSuiteRunner` sobre `SandboxRunner`. **Não integrado** (sem persistência/API/UI) |
| 10 | Integração Git | `ec63833` | `@forge/git`: `GitProvider`, `MockGitProvider`, `GitHubGitProvider`. **Não integrado** |
| 11 | Ambientes | `bdeab10`, `4386a97`, +1 (esta sessão) | `GET /projects/:id/environments`, `POST .../deployments` (com gate de aprovação para ambientes protegidos), `POST .../deployments/:id/approve`/`reject` (decisão do gate, `environment:approve_deployment`), UI de decisão, seed. Detalhe na seção "Fase 11 continuação #2" abaixo. **Deploy real em provedor externo/logs de ambiente ainda pendentes** |
| 12 | Conhecimento | `0c06396`, `80fb194` | `@forge/knowledge`; persistência seedada em `knowledge_sources`/`knowledge_chunks`; endpoints tenant-scoped; UI de fontes e busca. **Indexer/embeddings/agentes pendentes** |
| 13 | Playground de IA | `bdeab10` | `/ai-playground`, avaliação determinística mock, permissão `ai_playground:use`. **Sem provedores reais** |
| 14 | Segurança/observabilidade | `bdeab10` | `docs/threat-model.md`, traces locais (`FORGE_TRACE_LOGS=1`), redaction, `/audit-logs` com escrita em login/trigger/cancel/playground/política. **Sem OpenTelemetry real** |
| 15 | Performance/acessibilidade | `bdeab10` + sessão atual não commitada | Skip link, foco visível, drawer mobile, testes de teclado, axe-core ampliado, testes responsivos e Lighthouse real com budgets. **CI de budgets por chunk pendente** |
| 16 | QA final/documentação | `0c4d3a4` | `docs/threat-model.md`, `docs/final-qa-handoff.md`, este arquivo |
| 17 | Fluxo de aprovação humana | `1de2c5c` | `POST /agent-runs/:id/approve`/`:id/reject`, tabela `approvals` (reaproveitada), UI de decisão na página de execução, SSE, audit log. Detalhe na seção da Fase 17 abaixo. |
| 18 | Execução real (limitada) atrás da aprovação | `ea66116` | `write_file`/`apply_patch` aprovados escrevem de verdade numa cópia isolada e descartável do repositório (`@forge/sandbox` conectado); `run_command`/`run_tests`/Git continuam simulados de propósito (sem Docker nesta máquina). Detalhe na seção da Fase 18 abaixo. |
| — | Correções pós-push (CI real, bugs de uso manual) | `94f9365`, `766d3cb`, `f8d3f08`, `10d707a`, `88e0bf2` | CI corrigido (typecheck dependia só do build de dependências, não do próprio; timeout curto no teste real do Docker); home redireciona pra `/projects`; caminho default do PGlite absoluto (era relativo ao CWD, causava banco "duplicado" entre seed e API dev); validação fail-fast de env em produção |

**O motor central do produto funciona de ponta a ponta**: login → projeto → tarefa → "Iniciar execução de IA" → orquestrador real processa via fila → timeline atualiza ao vivo via SSE → para em "Aguardando aprovação" quando a política de ferramentas exige → **um `tech_lead`/`platform_engineer`/`admin` aprova ou rejeita as tool calls pendentes** → execução termina em `completed` (aprovada) ou `failed` (rejeitada).

## Fase 17 — Fluxo de aprovação humana (detalhe)

Implementado nesta sessão: `POST /agent-runs/:id/approve` e `POST /agent-runs/:id/reject` (`apps/api/src/modules/agent-runs/agent-runs.controller.ts`/`.service.ts`), restritos a `agent_run:approve` (409 se a execução não estiver em `approval_required`, 404 genérico cross-tenant, mesmo padrão de `cancel`). Cada decisão: (1) transiciona o `agentRun` via `transitionAgentRunStatus` (`@forge/domain`) — aprovação vai para `completed`, rejeição para `failed`; (2) resolve toda `toolCall` que ficou `pending` aguardando aprovação para `succeeded`/`rejected` (`AgentRunsRepository.resolvePendingToolCalls`) — nenhuma fica "pendente" para sempre numa execução já terminal; (3) grava uma linha em `approvals` (reaproveitada, `subjectType: 'agent_run'`) via `AgentRunApprovalsRepository`, recuperando `requestedByUserId` do audit log `agent_run.triggered` mais recente para aquele `agentRun` (`AuditLogsService.findLatestActorForTarget`) — `null` se não existir; (4) publica no canal SSE existente (`AgentRunEventsService`); (5) grava audit log `agent_run.approved`/`agent_run.rejected`.

**Rejeição vai para `failed`, não `cancelled`** (decisão deliberada, ambas as arestas existem no grafo de `@forge/domain` a partir de `approval_required`): `cancelled` já tem semântica própria (interromper algo EM ANDAMENTO, `agent_run:cancel`, concedida a quase todo papel incluindo quem disparou a execução). Rejeitar uma proposta de uma execução que já rodou o pipeline inteiro (só parou por exigir aprovação) não é "interromper" nada — é um veredito sobre um resultado que já existe. Reaproveitar `cancelled` misturaria duas trilhas de auditoria/permissão distintas sob o mesmo status; a diferença real entre "falhou tecnicamente" e "foi rejeitada por um humano" fica na linha de `approvals` e no audit log, não no enum `AgentRunStatus`.

Frontend: `apps/web/src/app/(product)/projects/[id]/tasks/[taskId]/runs/[runId]/agent-run-detail-view.tsx` ganhou um painel "Aprovação necessária" (visível quando `status === 'approval_required'` e há tool calls pendentes) com os argumentos/resultado propostos e botões "Aprovar"/"Rejeitar" — só renderizados para quem tem `agent_run:approve` no cliente (`apps/web/src/lib/agent-run-approval-permission.ts`, mirror do RBAC do backend, mesmo padrão de `agent-run-cancelable.ts`; busca o papel via `GET /auth/me`, endpoint que já existia mas nunca tinha sido consumido pelo frontend). O backend é sempre a autorização real — o mirror só evita oferecer um botão que renderia 403.

Testes novos: `apps/api/test/agent-runs.e2e-spec.ts` (+9 casos: sucesso/409/403/404 para approve e reject, incluindo o teste do canal SSE), `apps/web/e2e/agent-run-approval.spec.ts` (3 cenários reais via Playwright: aprovar, rejeitar, esconder botões para `developer` — todos verificando a mudança de status via SSE, sem `page.reload()`). Um teste pré-existente (`login-to-agent-run.spec.ts`) tinha uma asserção frágil (`getByText('agent_run.approved')` sem `.first()`) que só nunca tinha quebrado porque nenhum outro teste até então escrevia essa ação de verdade no banco compartilhado de e2e — corrigido com `.first()`, mesmo idioma já usado em `agent-run-orchestration.spec.ts` para o mesmo tipo de colisão entre specs rodando em paralelo.

## Fase 18 — Execução real (limitada) conectada atrás da aprovação humana

Implementado nesta sessão, na sequência direta da Fase 17: quando um `tech_lead`/`platform_engineer`/`admin` aprova uma execução parada em `approval_required`, toda tool call `write_file`/`apply_patch` que ficou `pending` agora **escreve de verdade**, não só muda de status.

**Fronteira de segurança (deliberada, releia antes de expandir isto)**:
- Só `write_file`/`apply_patch` viram execução real, e só contra uma **cópia isolada e descartável** do repositório demo — `.data/workspaces/<repositoryId>/` (`repositoryId` = PK de `repositories`, não `agentRuns.id`: a cópia é **persistente entre execuções sobre o mesmo projeto**, criada de forma preguiçosa na primeira escrita aprovada, para que um patch aprovado numa execução possa legitimamente desalinhar e falhar numa execução seguinte se o arquivo já mudou — é exatamente esse cenário que os testes cobrem). `fixtures/<repositoryName>/` original **nunca** é tocado — só lido uma vez, na cópia inicial (`fs.cp` recursivo, nunca sobrescreve a origem).
- `run_command`/`run_tests` e `create_commit`/`create_pull_request` **continuam simulados**, de propósito: o único runner disponível nesta máquina (`LocalProcessSandboxRunner`, `@forge/sandbox`, Fase 8) não isola rede — rodar um comando real a partir de uma proposta de IA exigiria `DockerSandboxRunner` com `--network=none` (ou equivalente), indisponível sem Docker aqui. Conectar isso é a lacuna que resta (ver abaixo).
- Path safety reaproveita `resolveInsideWorkspace` (`@forge/sandbox/path-policy.ts`) — a mesma função que `LocalProcessSandboxRunner` já usava para validar `cwd` de `run_command`, agora também importada por `apps/api` (nova dependência `@forge/sandbox` do app) para validar o `path` proposto de cada escrita.
- Aplicação de patch reaproveita `diff` (jsdiff, já dependência de `apps/web`/`packages/database`) — o mesmo formato de unified diff mínimo que `packages/ai/src/mock-provider.ts` já produzia (sem cabeçalho `Index:`/`===`), confirmado compatível com `applyPatch` antes de escrever qualquer código.

**Arquitetura**: a lógica de fs real vive em `apps/api/src/modules/agent-runs/agent-run-workspace.service.ts` (`AgentRunWorkspaceService`), não em `@forge/agents` — mesma decisão de design de `RepositoryFsService`/`ArtifactStorageService` (fs real por trás de um serviço Nest em `apps/api`, nunca em um pacote framework-agnostic). Preserva intocada a garantia já testada de `AgentRunOrchestrator` ("`require_approval` NUNCA executa de verdade" — ver `orchestrator.test.ts`): o orquestrador continua gravando só o resultado simulado; a execução real acontece inteiramente em `AgentRunsService.decide()` (chamado por `approve()`/`reject()`), ANTES de qualquer transição de status ser persistida.

**Falha real de patch = execução vai para `failed`, mesmo tendo sido aprovada**: se `applyPatch` não aplicar limpo (ex.: outra execução já alterou o arquivo desde então), a aprovação não "funciona" silenciosamente — `AgentRunsService.decide` computa o status final (`completed` vs `failed`) SÓ DEPOIS de tentar as escritas reais, não antes. A linha de `approvals` continua registrando a decisão HUMANA como `approved` (o tech lead realmente aprovou); é o status da EXECUÇÃO que diverge para `failed` pela falha técnica real — as duas coisas são conceitos distintos e ficam em colunas/tabelas distintas de propósito, sem inventar um terceiro valor no enum `AgentRunStatus`/`ApprovalStatus`.

Audit log novo: `agent_run.changes_applied` (além do já existente `agent_run.approved`/`agent_run.rejected`), emitido só quando pelo menos uma tool call de escrita foi processada de verdade — metadata lista `{ toolCallId, path, ok, error? }` por escrita, nunca conteúdo de arquivo/patch.

Testes novos (todos reais, sem mock de fs):
- `packages/sandbox/src/path-policy.test.ts` — cobertura direta de `resolveInsideWorkspace` (antes só exercitada indiretamente via `LocalProcessSandboxRunner`), já que agora tem um segundo consumidor real.
- `apps/api/src/modules/agent-runs/agent-run-workspace.service.test.ts` — cópia na primeira escrita, reaproveitamento idempotente, patch válido aplicado de verdade (com hash antes/depois do fixture original provando que nunca foi tocado), patch inválido tratado como erro real, path traversal rejeitado, patch ausente/inválido tratado sem lançar.
- `apps/api/test/agent-run-approval-execution.e2e-spec.ts` (novo arquivo, 3 casos e2e reais via HTTP/PGlite): aprovação aplica o patch de verdade na cópia isolada E nunca no fixture original (hash comparado antes/depois); patch que não aplica limpo derruba a execução para `failed` mesmo aprovada; `run_command` aprovado continua com `result` bit-a-bit idêntico ao simulado (prova negativa explícita de que nada real rodou).
- `apps/api/test/agent-runs.e2e-spec.ts` (pré-existente, não alterado) continua verde e agora também serve como regressão do caminho "sem repositório configurado" — prova que a nova lógica degrada graciosamente quando não há nada real para escrever.

## Fase 11 continuação #2 — decisão de aprovação de deployment (queued -> approve/reject)

Implementado nesta sessão: a lacuna registrada na tabela acima ("decisão approve/reject do gate... pendentes") — até aqui um `deployment` protegido ficava `queued` com uma `approval` `pending` para sempre, sem nenhum jeito de decidi-la. `POST /projects/:projectId/environments/:environmentId/deployments/:deploymentId/approve` e `.../reject` (`apps/api/src/modules/environments/environments.controller.ts`/`.service.ts`/`.repository.ts`) resolvem isso, seguindo o mesmo padrão já validado por `AgentRunsService.approve`/`reject`/`decide` (Fase 17): 409 se o `deployment` não estiver `queued` ou não houver uma `approval` `pending` para ele, 404 genérico cross-tenant (projeto/ambiente/deployment fora do tenant), audit log `deployment.approved`/`deployment.rejected`.

**Decisão de permissão (a parte não óbvia do briefing) — `environment:approve_deployment` é uma permissão NOVA, não reaproveita `environment:deploy`**: hoje `environment:deploy` (quem pode SOLICITAR um deploy) só é concedida a `platform_engineer`/`admin` — ao contrário do fluxo de `agent_run`, onde `agent_run:trigger` já tem um conjunto de papéis mais amplo (developer/qa_engineer/tech_lead/platform_engineer) do que `agent_run:approve` (tech_lead/platform_engineer/admin). Se a decisão de aprovar um deployment reaproveitasse `environment:deploy`, o único papel não-admin capaz de solicitar (`platform_engineer`) também seria o único capaz de aprovar o próprio pedido — esvaziando o sentido do gate (spec §13: "Deploy para ambientes protegidos exige aprovação" pressupõe um segundo julgamento humano, não o mesmo ator). Por isso `environment:approve_deployment` (`packages/types/src/enums.ts`, `packages/domain/src/permissions.ts`) fica restrita só a `admin` — estritamente mais restrita do que quem solicita, não o mesmo conjunto de papéis. Isso exigiu adicionar um usuário demo novo: `admin@acme-platform.example` / `demo1234` (`packages/database/src/seed/run-seed.ts`, `ensureDemoAdmin`), já que antes desta sessão não havia nenhum usuário `admin` seedado na organização "Acme Platform".

**Decisão sobre SSE vs. refetch simples**: ao contrário do fluxo de `agent_run` (que tem uma página de detalhe dedicada por execução, com `AgentRunEventsService`/SSE), deployments não têm uma view de "detalhe ao vivo" — só um badge numa lista na tela de projeto (`project-detail-view.tsx`). A decisão em si é uma única chamada HTTP síncrona que já retorna o estado final (não há um processo assíncrono rodando em background para acompanhar depois da resposta). Por isso esta sessão optou por **não** adicionar um canal SSE aqui: o mesmo padrão de invalidação de query do TanStack Query que `requestDeployment` já usava (`queryClient.invalidateQueries(['projects', projectId, 'environments'])` após a mutação) já satisfaz o requisito de "refletir o resultado sem reload manual da página inteira" sem a complexidade adicional de mais um canal de eventos para um resultado que não muda depois de decidido.

**Reaproveitamento da tabela `approvals`, mas com uma diferença real do padrão de `agent_run`**: o fluxo de `agent_run` (Fase 17) insere uma linha JÁ DECIDIDA em `approvals` no momento da decisão, porque não existe hoje um registro `pending` prévio naquele fluxo. Deployments são diferentes: `requestDeployment` (Fase 11 original) já grava a `approval` em `pending` no momento do pedido (`createPendingDeploymentApproval`) — então decidir aqui é um UPDATE na MESMA linha (`EnvironmentsRepository.decideDeploymentApproval`), preenchendo `approvedByUserId`/`decidedAt`, não um INSERT de uma linha nova. `reason`: se quem decide informar um motivo, ele substitui o motivo original (a justificativa automática do pedido); se não informar, o motivo original é preservado — é a mesma coluna para os dois casos, não há campo separado.

Aprovação conclui o `deployment` como `succeeded` (mesma simulação demo de "sucesso imediato" que ambientes não-protegidos já tinham, com `startedAt`/`completedAt` reais); rejeição conclui como `failed` — sem estado "cancelado" à parte (`DeploymentStatus` não tem um, ao contrário de `AgentRunStatus`), a diferença entre "erro técnico" e "rejeitado por um humano" fica na linha de `approvals`/audit log, não no enum de status (mesmo raciocínio já usado na Fase 17 para `agent_run`).

Frontend: `apps/web/src/app/(product)/projects/[id]/project-detail-view.tsx` ganhou botões "Aprovar deploy"/"Rejeitar deploy" no card de cada ambiente quando há gate pendente, visíveis só para quem tem `environment:approve_deployment` no cliente (`apps/web/src/lib/deployment-approval-permission.ts`, mirror do RBAC do backend, mesmo padrão de `agent-run-approval-permission.ts`). Erro de decisão mostra mensagem inline (`role="alert"`); sucesso invalida a query de ambientes e de audit logs.

Testes novos:
- `packages/domain/src/permissions.test.ts`: `environment:approve_deployment` é exclusiva de `admin`, incluindo o caso explícito de que `platform_engineer` tem `environment:deploy` mas NÃO `environment:approve_deployment`.
- `apps/api/test/environments.e2e-spec.ts` (+8 casos, novo describe block): aprovação e rejeição com sucesso (status final, audit log, `latestApproval`); 409 ao decidir duas vezes o mesmo deployment; 409 num deployment de ambiente não-protegido (nunca teve approval pendente); 403 para `platform_engineer` tentando decidir o próprio pedido; 403 sem nenhuma permissão de deploy; 404 cross-tenant; 404 para `deploymentId` malformado.
- `apps/web/e2e/deployment-approval.spec.ts` (2 cenários reais via Playwright, servidores reais): login como `platform@acme-platform.example` -> solicita deploy em "Staging" (ambiente protegido diferente de "Production", usado por `environment-deployments.spec.ts`, para não colidir sob execução paralela) -> troca de sessão (`clearCookies()` antes do segundo `page.goto('/login')` — o `proxy.ts` redireciona `/login` para longe quando já há sessão válida, então login como um segundo usuário na mesma `page` exige derrubar o cookie antes) -> login como `admin@acme-platform.example` -> aprova (ou rejeita, no segundo teste) -> confirma o badge mudar para "Saudável"/"Falhou" sem `page.reload()`. `test.describe.configure({ mode: 'serial' })` porque os dois testes compartilham o mesmo ambiente "Staging" e `fullyParallel: true` rodaria em workers concorrentes por padrão.

## O que falta (decisão consciente, não esquecimento)

**Conectar `run_command`/`run_tests` a execução real exige `DockerSandboxRunner` com isolamento de rede** (`--network=none` ou equivalente) — não está disponível nesta máquina de desenvolvimento (sem Docker). Até lá, essas ferramentas continuam simuladas mesmo depois de aprovadas, por design (ver Fase 18 acima), não por lacuna esquecida.

`@forge/testing`/`@forge/git` (Fases 9/10) continuam não conectados: nenhuma execução de teste real persiste em `test_runs`/`test_suites`, e nenhuma operação Git real (`create_commit`/`create_pull_request`) acontece — a Fase 18 conectou só a fatia de menor risco (escrita de arquivo num workspace isolado), deliberadamente, não o resto do pipeline.

Outras lacunas menores, por fase (detalhe em cada seção do `docs/final-qa-handoff.md` anterior, ainda útil como referência):
- Fase 9: persistir execuções em `test_runs`/`test_suites`/`test_artifacts`.
- Fase 10: persistir operações Git nas tabelas existentes; cliente GitHub real.
- Fase 11: execução real em provedor externo; logs/saúde reais de ambiente. (decisão approve/reject já implementada nesta sessão — ver seção acima)
- Fase 12: indexador automático de docs/ADRs/repositório; embeddings/vector store; conexão da recuperação com agentes.
- Fase 13: provedores de IA reais; histórico persistido.
- Fase 14: exporter OpenTelemetry real; audit log em mais endpoints.
- Fase 15: budgets por chunk/bundle em CI e refinamentos responsivos para telas futuras.
- Fase 17: a `approval` gravada nasce já decidida (aprovada/rejeitada) — não existe hoje um registro `pending` da própria aprovação criado quando a execução entra em `approval_required` (o estado "pendente" é representado pelo `agentRun.status`/`toolCall.status`, não por uma linha própria em `approvals`); um painel "aprovações pendentes" cross-execução (fora da página de uma execução específica) exigiria isso.

## Convenções estabelecidas (leia antes de escrever código novo)

- **Sem build step** em `packages/types`, `packages/domain`, `packages/database`, `packages/ai`, `packages/agents`: imports relativos internos usam extensão `.ts` explícita (não `.js`) — Node nativo em modo strip-only exige apontar pro arquivo que existe de verdade em disco. **Sempre valide `apps/api` como processo real** depois de mexer nesses pacotes (`apps/api/test/runtime-smoke.e2e-spec.ts`) — typecheck/Vitest sozinhos mascaram esse tipo de bug.
- **Infra local sem credenciais externas**: PGlite no lugar de Postgres, fila em memória no lugar de Redis, IA mock no lugar de Anthropic real. Trocável via env var sem mudar código.
- **Todo endpoint novo**: `*Repository` com `organizationId` no `WHERE`, `*Service` fino, `*Controller` com guards + `@RequirePermission`, 404 genérico cross-tenant.
- **Todo teste novo é real**: PGlite de verdade, supertest real, Playwright com servidores reais.
- **Bancos de e2e fixos em disco** (`apps/web/.data/e2e-web/`) precisam ser resetados a cada execução da suíte — ver `apps/web/e2e/reset-e2e-db.mjs`. Se criar outra suíte e2e com banco próprio, replique esse padrão.
- **Processo de trabalho validado**: cada fase/tarefa grande = um agente em background com briefing detalhado e critério de aceite com verificação real. Ao terminar, **sempre reverificar de forma independente** antes de confiar (rebuild sem cache, e2e completo, ler código dos pontos sensíveis) — isso já pegou várias regressões reais que o autorrelato não via.
- Se um agente falhar com `rate_limit`/429, retome com `SendMessage` usando o `agentId` (preserva contexto) em vez de recomeçar.
- Pode haver uma **sessão paralela de outro projeto** nesta máquina usando portas 3000-3002/5183 — nunca mate processos que não sejam do Forge; use portas 3100+ para testes.
- **Se outra ferramenta de IA estiver/tiver trabalhado no mesmo repo em paralelo**, `git status --short` primeiro, sempre.

## Credenciais de demo (após `pnpm --filter @forge/database db:seed`)

Organização "Acme Platform":
- `tech-lead@acme-platform.example` / `demo1234` (role `tech_lead`, tem `agent_run:approve`)
- `platform@acme-platform.example` / `demo1234` (role `platform_engineer`, tem `environment:deploy`)
- `dev@acme-platform.example` / `demo1234` (role `developer`)
- `admin@acme-platform.example` / `demo1234` (role `admin`, único papel com `environment:approve_deployment` — adicionado nesta sessão, `ensureDemoAdmin` em `packages/database/src/seed/run-seed.ts`)

## Requisito do usuário registrado no prompt mestre

`FORGE-CLAUDE-CODE-PROMPT.md` tem uma regra explícita adicionada pelo usuário: a interface precisa suportar tema claro/escuro com alternância acessível e persistência — implementado e testado nas Fases 0/4.
