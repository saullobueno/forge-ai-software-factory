import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createDatabase, type Database } from '@forge/database';
import { DatabaseQueryOtelRecorder } from './database-query-otel-recorder.js';

/**
 * Adapta `createDatabase()` de `@forge/database` (PGlite local ou Postgres
 * real via `DATABASE_URL`, mesmo client usado pelos scripts de
 * migração/seed — ver `packages/database/src/client.ts`) ao ciclo de vida
 * do NestJS. A conexão é aberta uma única vez por processo (padrão
 * singleton do Nest) e fechada em `onModuleDestroy`, para que
 * `app.close()` nos testes e2e não deixe conexões/arquivos PGlite presos.
 *
 * `queryObserver: this.queryRecorder` dá a cada query real contra o PGlite
 * (dev/teste local) um span OTel próprio — `createDatabase()` só aplica
 * esse observador no caminho PGlite; contra Postgres real via `pg`,
 * `@opentelemetry/instrumentation-pg` (auto-instrumentação já registrada em
 * `apps/api/src/tracing.ts`) já cobre isso sozinha, ver comentário completo
 * em `DatabaseQueryOtelRecorder`.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly connection: { db: Database; close: () => Promise<void> };

  constructor(private readonly queryRecorder: DatabaseQueryOtelRecorder) {
    this.connection = createDatabase({ queryObserver: this.queryRecorder });
  }

  get db(): Database {
    return this.connection.db;
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
  }
}
