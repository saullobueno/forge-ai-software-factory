import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Roda antes de `db:migrate`/`db:seed` na cadeia de `webServer` do
// Playwright (ver playwright.config.ts) para apagar o PGlite isolado do
// e2e antes de cada execução da suíte. Sem isso, um arquivo deixado por
// uma execução anterior faz o seed (idempotente por design, correto para
// um banco de demo real) pular a inserção de dados novos adicionados ao
// seed depois daquela execução — foi exatamente o que aconteceu ao rodar
// a suíte várias vezes no mesmo dia: os audit logs adicionados ao seed não
// apareciam porque a organização "já existia" num banco de e2e obsoleto.
const dbFilePath = fileURLToPath(new URL('../.data/e2e-web/forge-e2e-web.pglite', import.meta.url));
const dataDir = dirname(dbFilePath);

rmSync(dataDir, { recursive: true, force: true });
console.log(`[reset-e2e-db] removido: ${dataDir}`);
