export * from './client.ts';
export * from './env.ts';
export * from './knowledge-indexing.ts';
export * from './sql-operation.ts';
/**
 * `runSeed`/`DEMO_PASSWORD` reexportados aqui (não só via `packages/
 * database/src/seed.ts`, o entrypoint do CLI `db:seed`) para que apps
 * consumidoras (`apps/api`) consigam rodar o seed real de ponta a ponta em
 * testes e2e sobre um PGlite efêmero próprio — mesmo padrão já usado por
 * `migratePglite` acima, evitando depender de um caminho de import
 * profundo (`@forge/database/src/seed/run-seed.ts`) que o `exports` map de
 * `package.json` não expõe.
 */
export { DEMO_PASSWORD, runSeed, type SeedSummary } from './seed/run-seed.ts';

/**
 * Reexporta os combinadores de query do Drizzle mais usados por
 * repositórios em `apps/api` (ex.: `ProjectsRepository`). Evita que apps
 * consumidoras precisem de uma dependência direta em `drizzle-orm` só
 * para montar `where` — uma única versão do driver em todo o monorepo,
 * resolvida aqui junto do schema/client.
 */
export { and, asc, desc, eq, gt, inArray, isNull, like, lt, or } from 'drizzle-orm';

/**
 * Reexporta o migrator do PGlite (mesmo usado por `db:migrate` — ver
 * `migrate.ts`) para que testes e2e de apps consumidoras (ex.: `apps/api`)
 * consigam migrar um banco de teste isolado do zero sem precisar de uma
 * dependência direta em `drizzle-orm` (que teria uma resolução de peer
 * dependencies diferente da usada aqui, quebrando a resolução de módulo
 * do pnpm).
 */
export { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
