export * from './client.ts';
export * from './env.ts';

/**
 * Reexporta os combinadores de query do Drizzle mais usados por
 * repositórios em `apps/api` (ex.: `ProjectsRepository`). Evita que apps
 * consumidoras precisem de uma dependência direta em `drizzle-orm` só
 * para montar `where` — uma única versão do driver em todo o monorepo,
 * resolvida aqui junto do schema/client.
 */
export { and, eq, or } from 'drizzle-orm';

/**
 * Reexporta o migrator do PGlite (mesmo usado por `db:migrate` — ver
 * `migrate.ts`) para que testes e2e de apps consumidoras (ex.: `apps/api`)
 * consigam migrar um banco de teste isolado do zero sem precisar de uma
 * dependência direta em `drizzle-orm` (que teria uma resolução de peer
 * dependencies diferente da usada aqui, quebrando a resolução de módulo
 * do pnpm).
 */
export { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
