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
```

Novos pacotes (`ai`, `agents`, `code-intelligence`, `sandbox`, `git`, `testing`, `policies`, `ui`) e apps (`runner`, `docs`) serão adicionados conforme as fases do roadmap avançam — ver `FORGE-CLAUDE-CODE-PROMPT.md`.

## Decisões de infraestrutura local (sem Docker)

Nesta máquina o Docker não está instalado. Para não bloquear o desenvolvimento, duas decisões foram tomadas:

1. **Banco de dados**: sem `DATABASE_URL` definido, o `@forge/database` usa [PGlite](https://pglite.dev) — um Postgres real compilado para WASM, embarcado no processo, sem instalação nenhuma. O mesmo schema Drizzle roda sem alterações contra um Postgres real (`pg`) assim que `DATABASE_URL` for definido — por exemplo, subindo `docker compose up -d postgres` depois que o Docker estiver instalado.
2. **Fila/Redis**: sem `REDIS_URL` definido, a API usa uma fila em memória (`InMemoryQueueAdapter`, mesma interface do BullMQ). Com `REDIS_URL` definido, passa a usar `BullMqQueueAdapter` (BullMQ + ioredis) automaticamente.
3. **IA**: nenhuma chave de provedor foi configurada. Até que `ANTHROPIC_API_KEY` (ou similar) seja definida, os agentes de IA (Fase 7) usam um adaptador mock determinístico, alinhado ao modo demo descrito na spec (§21).

Nada disso exige mudança de código quando a infraestrutura real estiver disponível — apenas variáveis de ambiente. Ver `.env.example`.

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
pnpm --filter @forge/database db:seed        # popula "Acme Platform" com 2 usuários + credenciais de demo
```

## Autenticação/RBAC (Fase 2)

- `POST /auth/login` (`{ email, password }`) retorna um JWT no corpo (`token`) e também como cookie `httpOnly` (`forge_session`, `sameSite=lax`, `secure` apenas em produção). `GET /auth/me` é protegido e retorna o usuário autenticado (sem hash de senha).
- **Credenciais de demo** (após `pnpm --filter @forge/database db:seed`, organização "Acme Platform"):
  - `tech-lead@acme-platform.example` / `demo1234` (role `tech_lead`)
  - `dev@acme-platform.example` / `demo1234` (role `developer`)
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
