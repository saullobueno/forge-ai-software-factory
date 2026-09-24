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

Último commit confirmado: **este commit** (conectar execução real, limitada, atrás da aprovação humana — ver Fase 18 abaixo). Todas as Fases 0-17 do roadmap estão commitadas e verificadas, e a Fase 18 (fora do roadmap formal original, mas a lacuna de maior alavancagem identificada ao final da Fase 17) também — ver tabela abaixo.

Validação final confirmada de forma independente (não só pelo autorrelato de quem implementou): `pnpm turbo run build lint typecheck test` → **34/34**; `pnpm --filter @forge/api test:e2e` → **89/89** (86 + 3 da Fase 18, em arquivo próprio); suíte Playwright completa → **12/12**.

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
| 11 | Ambientes | `bdeab10` | `GET /projects/:id/environments`, UI no detalhe do projeto, seed. **Deploy real pendente** |
| 12 | Conhecimento | `0c06396` | `@forge/knowledge`: chunking, retrieval lexical, defesa contra prompt injection. **Não integrado** |
| 13 | Playground de IA | `bdeab10` | `/ai-playground`, avaliação determinística mock, permissão `ai_playground:use`. **Sem provedores reais** |
| 14 | Segurança/observabilidade | `bdeab10` | `docs/threat-model.md`, traces locais (`FORGE_TRACE_LOGS=1`), redaction, `/audit-logs` com escrita em login/trigger/cancel/playground/política. **Sem OpenTelemetry real** |
| 15 | Performance/acessibilidade | `bdeab10` | Skip link, foco visível, testes de teclado + axe-core. **Sem Lighthouse/budgets** |
| 16 | QA final/documentação | `0c4d3a4` | `docs/threat-model.md`, `docs/final-qa-handoff.md`, este arquivo |
| 17 | Fluxo de aprovação humana | `1de2c5c` | `POST /agent-runs/:id/approve`/`:id/reject`, tabela `approvals` (reaproveitada), UI de decisão na página de execução, SSE, audit log. Detalhe na seção da Fase 17 abaixo. |
| 18 | Execução real (limitada) atrás da aprovação | *(este commit)* | `write_file`/`apply_patch` aprovados escrevem de verdade numa cópia isolada e descartável do repositório (`@forge/sandbox` conectado); `run_command`/`run_tests`/Git continuam simulados de propósito (sem Docker nesta máquina). Detalhe na seção da Fase 18 abaixo. |

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

## O que falta (decisão consciente, não esquecimento)

**Conectar `run_command`/`run_tests` a execução real exige `DockerSandboxRunner` com isolamento de rede** (`--network=none` ou equivalente) — não está disponível nesta máquina de desenvolvimento (sem Docker). Até lá, essas ferramentas continuam simuladas mesmo depois de aprovadas, por design (ver Fase 18 acima), não por lacuna esquecida.

`@forge/testing`/`@forge/git` (Fases 9/10) continuam não conectados: nenhuma execução de teste real persiste em `test_runs`/`test_suites`, e nenhuma operação Git real (`create_commit`/`create_pull_request`) acontece — a Fase 18 conectou só a fatia de menor risco (escrita de arquivo num workspace isolado), deliberadamente, não o resto do pipeline.

Outras lacunas menores, por fase (detalhe em cada seção do `docs/final-qa-handoff.md` anterior, ainda útil como referência):
- Fase 9: persistir execuções em `test_runs`/`test_suites`/`test_artifacts`.
- Fase 10: persistir operações Git nas tabelas existentes; cliente GitHub real.
- Fase 11: fluxo de criação de deployment; approvals de ambiente protegido.
- Fase 12: indexador real de docs/ADRs; persistência; conexão com agentes.
- Fase 13: provedores de IA reais; histórico persistido.
- Fase 14: exporter OpenTelemetry real; audit log em mais endpoints.
- Fase 15: Lighthouse/budgets; testes responsivos.
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
- `dev@acme-platform.example` / `demo1234` (role `developer`)

## Requisito do usuário registrado no prompt mestre

`FORGE-CLAUDE-CODE-PROMPT.md` tem uma regra explícita adicionada pelo usuário: a interface precisa suportar tema claro/escuro com alternância acessível e persistência — implementado e testado nas Fases 0/4.
