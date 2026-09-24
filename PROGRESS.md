# Forge — Status de implementação

Última atualização: 2026-09-24 (pausa de sessão a pedido do usuário). Este arquivo existe para que **qualquer sessão futura** (Claude Code ou humana) consiga retomar o trabalho sem precisar reconstruir contexto a partir do zero. Leia isto antes de qualquer coisa; depois confirme contra `git log` e rodando a suíte, porque este arquivo pode ficar desatualizado.

## Como retomar (primeiros passos, nesta ordem)

```bash
pnpm install
pnpm turbo run build lint typecheck test   # deve dar tudo verde antes de continuar
git log --oneline                           # confira se há commits depois do último listado abaixo
git status --short                          # confira se não há trabalho não commitado de uma sessão anterior
```

Último commit confirmado nesta pausa: **`d415453`** ("fix(web): tolerate any cancelable status in the cancel/SSE e2e"). Se `git log` mostrar algo depois disso, é trabalho de uma **Fase 8 disparada em background que ainda não foi revisada** — ver seção "Fase 8" abaixo antes de confiar nele.

## Fases concluídas e verificadas (0-7)

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

**O motor central do produto já funciona de ponta a ponta**: login → projeto → tarefa → "Iniciar execução de IA" → orquestrador real processa via fila → timeline atualiza ao vivo via SSE → para em "Aguardando aprovação" quando a política de ferramentas exige (nunca executa `write_file`/`apply_patch`/`run_command`/etc. de verdade contra o host — ver decisão de escopo abaixo).

## Fase 8 — Runner/Sandbox (status na pausa: **disparada em background, resultado não revisado**)

Briefing dado ao agente (resuma para não repetir o trabalho, ou para retomar se ele não tiver terminado/commitado):
- `packages/sandbox` (`@forge/sandbox`): interface `SandboxRunner` + duas implementações — `DockerSandboxRunner` (real, detecta se `docker` está disponível) e `LocalProcessSandboxRunner` (fallback para esta máquina sem Docker: confinamento de workspace, timeout com kill de árvore de processos, política de comando via extensão de `DESTRUCTIVE_COMMAND_PATTERNS` de `@forge/domain`, env vars allowlisted).
- **Decisão de escopo deliberada**: NÃO conecta ao orquestrador da Fase 7 — `AgentRunOrchestrator`/`real-tool-runner.ts` continuam simulando `write_file`/`apply_patch`/`run_command` como antes. Conectar de verdade exigiria um fluxo de aprovação humana real (Fase 11), que ainda não existe — ligar um runner de execução real a comandos gerados por IA sem humano no loop seria o oposto do que a spec pede (§18).
- Teste do `DockerSandboxRunner` deve pular graciosamente nesta máquina (sem Docker) mas rodaria de verdade em CI (`ubuntu-latest` tem Docker).

**Ação ao retomar**: se houver um commit novo depois de `d415453`, revise-o com o mesmo rigor das fases anteriores antes de confiar — rode a suíte completa sem cache, confirme que o teste Docker realmente pulou (não falhou silenciosamente) e que nada foi conectado ao orquestrador. Se não houver commit nenhum e a árvore de trabalho estiver limpa, o agente pode ter sido interrompido antes de terminar — disparar de novo com o mesmo briefing (ver histórico desta conversa) é seguro.

## Fases restantes (roadmap, `FORGE-CLAUDE-CODE-PROMPT.md`)

9. Execução de testes (usar o runner da Fase 8 pra rodar suites de verdade)
10. Integração Git real (`packages/git`, interface + provider Mock/GitHub)
11. Ambientes (deployments, aprovação para ambientes protegidos)
12. Conhecimento (ingestão de docs/ADRs, RAG com defesa contra prompt injection)
13. Playground de IA (comparação de modelos, custo/latência)
14. Segurança/observabilidade (threat model, traces OpenTelemetry)
15. Performance/acessibilidade
16. QA final/documentação

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
