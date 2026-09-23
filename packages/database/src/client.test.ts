import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './client.ts';

describe('createDatabase (PGlite)', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('conecta em um Postgres real embarcado (PGlite) e executa uma query', async () => {
    const created = createDatabase();
    close = created.close;
    const db: Database = created.db;

    const result = await db.execute(sql`select 1 as value`);
    expect(result.rows[0]).toEqual({ value: 1 });
  });
});
