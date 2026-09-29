import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzleNodePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';
import { databaseEnv } from './env.ts';
import * as schema from './schema/index.ts';

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

/**
 * Observador de query individual, chamado em torno de toda execução real
 * contra o PGlite (ver `instrumentPgliteQueries` abaixo). `@forge/database`
 * continua desacoplado de OpenTelemetry de propósito — mesma decisão já
 * tomada para `packages/agents` (`AgentRunTraceSink`, `ports.ts`): esta lib
 * só expõe o ponto de extensão mínimo; quem implementa `observe` com spans
 * OTel reais é `apps/api` (`DatabaseQueryOtelRecorder`), reaproveitando o
 * `TracerProvider`/`LoggerProvider` globais já registrados por
 * `apps/api/src/tracing.ts` — nenhum bootstrap paralelo aqui.
 */
export interface DatabaseQueryObserver {
  observe<T>(sql: string, paramCount: number, run: () => Promise<T>): Promise<T>;
}

export interface CreateDatabaseOptions {
  queryObserver?: DatabaseQueryObserver;
}

/**
 * Sem DATABASE_URL, o Forge roda em cima do PGlite — um Postgres real
 * compilado para WASM, embarcado no processo. Isso permite desenvolvimento
 * local com semântica de Postgres genuína sem exigir Docker instalado.
 * Quando DATABASE_URL estiver definido (ex.: docker-compose.yml na raiz),
 * o mesmo schema Drizzle passa a rodar contra um Postgres real via `pg`.
 *
 * `options.queryObserver` só é aplicado no caminho PGlite (confirmado lendo
 * o código-fonte de `@opentelemetry/instrumentation-pg`, dependência de
 * `@opentelemetry/auto-instrumentations-node` já usada por
 * `apps/api/src/tracing.ts`: ela faz `patch` direto em `pg.Client.prototype.
 * query`, então toda query real contra Postgres via `pg` já ganha um span
 * OTel automaticamente, sem qualquer código deste arquivo — reimplementar
 * isso aqui duplicaria spans. O PGlite (`@electric-sql/pglite`) é uma
 * implementação própria em WASM, nunca passa pelo módulo `pg`, então essa
 * auto-instrumentação nunca o alcança — só o caminho de dev/teste local
 * precisa do observador manual abaixo).
 */
export function createDatabase(
  options: CreateDatabaseOptions = {},
): { db: Database; close: () => Promise<void> } {
  if (databaseEnv.DATABASE_URL) {
    const pool = new Pool({ connectionString: databaseEnv.DATABASE_URL });
    const db = drizzleNodePostgres(pool, { schema });
    return { db, close: () => pool.end() };
  }

  mkdirSync(dirname(databaseEnv.DATABASE_LOCAL_PATH), { recursive: true });
  const client = new PGlite(databaseEnv.DATABASE_LOCAL_PATH);
  if (options.queryObserver) {
    instrumentPgliteQueries(client, options.queryObserver);
  }
  const db = drizzlePglite(client, { schema });
  return { db, close: () => client.close() };
}

/**
 * Envolve `client.query` (o único ponto de entrada real que toda query do
 * Drizzle contra PGlite atravessa — confirmado lendo `drizzle-orm/pglite/
 * session.js`: `PglitePreparedQuery.execute`/`.all()` sempre chamam
 * `client.query(queryString, params, ...)`, nunca outro método) com um
 * wrapper explícito ao redor do client, medindo a duração REAL da query
 * (início/fim), já que o hook `logger.logQuery(query, params)` do Drizzle
 * dispara de forma síncrona ANTES da query executar — sem um lado "fim"
 * correspondente — e por isso não serviria para medir duração real (só
 * texto/params no início). O cast final é necessário porque `PGlite#query`
 * é genérico (`query<T>(...)`) e o wrapper, deliberadamente, não precisa
 * preservar esse genérico em runtime (é transparente para quem chama).
 */
function instrumentPgliteQueries(client: PGlite, observer: DatabaseQueryObserver): void {
  const originalQuery = client.query.bind(client);
  const wrapped = (sql: string, params?: unknown[], queryOptions?: unknown) =>
    observer.observe(sql, params?.length ?? 0, () =>
      originalQuery(sql, params, queryOptions as never),
    );
  client.query = wrapped as unknown as typeof client.query;
}

export { schema };
