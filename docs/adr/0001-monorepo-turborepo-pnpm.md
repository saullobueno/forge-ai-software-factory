# ADR 0001 — Monorepo com pnpm + Turborepo

**Contexto.** Web (Next.js), API (NestJS) e pacotes de domínio compartilham tipos Zod, regras de negócio e schema.

**Decisão.** Um monorepo pnpm com Turborepo: `apps/web`, `apps/api` e `packages/{types,domain,database,agents,ai,knowledge,git,sandbox,testing}`.

**Consequências.** Contratos únicos (Zod em `@forge/types`) entre front e back; cache de build/teste; CI única. Custo: instalação e build maiores, e cuidado para o web não depender de `@forge/domain` (espelhos de permissão na UI são apenas UX — a autorização real é do backend).
