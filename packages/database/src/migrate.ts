import { migrate as migrateNodePostgres } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { createDatabase } from './client';
import { databaseEnv } from './env';

async function main() {
  const { db, close } = createDatabase();

  if (databaseEnv.DATABASE_URL) {
    await migrateNodePostgres(db as Parameters<typeof migrateNodePostgres>[0], {
      migrationsFolder: './drizzle',
    });
  } else {
    await migratePglite(db as Parameters<typeof migratePglite>[0], {
      migrationsFolder: './drizzle',
    });
  }

  await close();
  console.log('Migrações aplicadas com sucesso.');
}

main().catch((error: unknown) => {
  console.error('Falha ao aplicar migrações:', error);
  process.exitCode = 1;
});
