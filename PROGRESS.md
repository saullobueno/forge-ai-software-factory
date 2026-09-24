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

Último commit confirmado nesta pausa: **`0059de4`** ("fix(web): wipe the e2e PGlite before each Playwright run"). Todas as Fases 0-16 do roadmap estão commitadas e verificadas — ver tabela abaixo.

Validação final confirmada de forma independente (não só pelo autorrelato de quem implementou): `pnpm turbo run build lint typecheck test` → **34/34**; `pnpm --filter @forge/api test:e2e` → **77/77**; suíte Playwright completa → **9/9**.

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

**O motor central do produto funciona de ponta a ponta**: login → projeto → tarefa → "Iniciar execução de IA" → orquestrador real processa via fila → timeline atualiza ao vivo via SSE → para em "Aguardando aprovação" quando a política de ferramentas exige.

## O que falta (decisão consciente, não esquecimento)

O roadmap formal (Fases 0-16) está com uma entrega em cada fase, mas **várias fases (8, 9, 10, 12) ficaram deliberadamente isoladas/não conectadas** — o motivo se repete em todas: conectar sandbox/testes/Git real ao orquestrador de agentes exige um **fluxo de aprovação humana de verdade** na frente, que ainda não existe. Hoje `approval_required` é um estado terminal que só fica lá parado — não há UI/endpoint pra um `tech_lead`/`platform_engineer` aprovar ou rejeitar.

**Isso é o próximo passo de maior alavancagem** (desbloqueia várias fases de uma vez, não só uma):
1. `POST /agent-runs/:id/approve` e `POST /agent-runs/:id/reject` (permissão `agent_run:approve`, já existe), gravando em `approvals` (já existe a tabela) e transicionando o `agentRun` (`transitionAgentRunStatus`, `@forge/domain`) para `completed` ou `failed`/`cancelled` conforme a decisão.
2. UI na página de detalhe da execução (`/projects/[id]/tasks/[taskId]/runs/[runId]`) mostrando os tool calls pendentes de aprovação com o diff/comando proposto, e botões Aprovar/Rejeitar.
3. Só depois disso faz sentido revisitar se/como conectar `@forge/sandbox`/`@forge/testing`/`@forge/git` para execução real atrás dessa aprovação — não antes.

Outras lacunas menores, por fase (detalhe em cada seção do `docs/final-qa-handoff.md` anterior, ainda útil como referência):
- Fase 9: persistir execuções em `test_runs`/`test_suites`/`test_artifacts`.
- Fase 10: persistir operações Git nas tabelas existentes; cliente GitHub real.
- Fase 11: fluxo de criação de deployment; approvals de ambiente protegido.
- Fase 12: indexador real de docs/ADRs; persistência; conexão com agentes.
- Fase 13: provedores de IA reais; histórico persistido.
- Fase 14: exporter OpenTelemetry real; audit log em mais endpoints.
- Fase 15: Lighthouse/budgets; testes responsivos.

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
