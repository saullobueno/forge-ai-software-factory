# Forge — Fábrica de Software com IA

Monorepo do Forge, conforme `FORGE-SPECIFICATION.md` (produto) e `FORGE-CLAUDE-CODE-PROMPT.md` (prompt de implementação).

## Stack

pnpm + Turborepo · Next.js/React/TypeScript/Tailwind · NestJS · Drizzle ORM (Postgres) · BullMQ/Redis · Vitest · Vercel AI SDK.

## Estrutura

```
apps/
  web/        Next.js (App Router) — frontend
  api/        NestJS — backend
packages/
  types/      Schemas Zod e tipos compartilhados
  database/   Schema Drizzle + client (Postgres real ou PGlite local)
```

Novos pacotes (`domain`, `ai`, `agents`, `code-intelligence`, `sandbox`, `git`, `testing`, `policies`, `ui`) e apps (`runner`, `docs`) serão adicionados conforme as fases do roadmap avançam — ver `FORGE-CLAUDE-CODE-PROMPT.md`.

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
```

## Regras de engenharia

Ver `FORGE-CLAUDE-CODE-PROMPT.md` — TypeScript strict, arquitetura em camadas, ferramentas de agente tipadas com autorização server-side, comandos de IA nunca executados diretamente no host, e tema claro/escuro obrigatório na interface.
