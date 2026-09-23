import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createDatabase, type Database } from '@forge/database';

/**
 * Adapta `createDatabase()` de `@forge/database` (PGlite local ou Postgres
 * real via `DATABASE_URL`, mesmo client usado pelos scripts de
 * migração/seed — ver `packages/database/src/client.ts`) ao ciclo de vida
 * do NestJS. A conexão é aberta uma única vez por processo (padrão
 * singleton do Nest) e fechada em `onModuleDestroy`, para que
 * `app.close()` nos testes e2e não deixe conexões/arquivos PGlite presos.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly connection = createDatabase();

  get db(): Database {
    return this.connection.db;
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
  }
}
