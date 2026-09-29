import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database, type DatabaseQueryObserver } from './client.ts';

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

  it('chama queryObserver.observe em torno de toda query real contra o PGlite, com o SQL/contagem de params reais', async () => {
    const calls: Array<{ sql: string; paramCount: number }> = [];
    const observer: DatabaseQueryObserver = {
      observe(observedSql, paramCount, run) {
        calls.push({ sql: observedSql, paramCount });
        return run();
      },
    };

    const created = createDatabase({ queryObserver: observer });
    close = created.close;

    const result = await created.db.execute(sql`select 1 as value, ${2} as other`);
    expect(result.rows[0]).toEqual({ value: 1, other: '2' });

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const call = calls.find((entry) => entry.sql.includes('select 1 as value'));
    expect(call).toBeDefined();
    expect(call!.paramCount).toBe(1);
  });

  it('propaga um erro real de query através de queryObserver.observe sem engolir a falha', async () => {
    const observer: DatabaseQueryObserver = {
      observe(_sql, _paramCount, run) {
        return run();
      },
    };

    const created = createDatabase({ queryObserver: observer });
    close = created.close;

    await expect(created.db.execute(sql`select * from tabela_que_nao_existe`)).rejects.toThrow();
  });
});
