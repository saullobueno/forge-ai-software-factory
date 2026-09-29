import { defineConfig, devices } from '@playwright/test';
import { E2E_API_PORT, E2E_API_URL, E2E_DATABASE_LOCAL_PATH, E2E_WEB_PORT } from './e2e/e2e-env';

// Migra + seeda o PGlite isolado (ver e2e/e2e-env.ts) e SÓ DEPOIS inicia a
// API — tudo em um único comando encadeado, não um `globalSetup` separado.
// Motivo: no runner do Playwright, os `webServer` sobem como parte da
// etapa de "plugin setup", que roda ANTES de `globalSetup` (confirmado
// lendo `playwright/lib/runner/index.js` — `createGlobalSetupTasks`
// retorna `[...createPluginSetupTasks(config), ...globalSetups]`, e
// `webServer` é registrado dentro de `createPluginSetupTasks`). Um
// `globalSetup` migrando/seedando separadamente rodaria DEPOIS da API já
// ter aberto sua própria conexão PGlite contra o arquivo antigo — a API
// serviria dados obsoletos/vazios mesmo depois do seed "terminar". Reusa
// os mesmos scripts CLI de `pnpm --filter @forge/database db:migrate`/
// `db:seed` (idempotentes — seguro rodar em toda execução da suíte).
// Apaga o PGlite isolado do e2e antes de migrar/seedar — sem isso, um
// arquivo deixado por uma execução anterior da suíte faz o seed (idempotente
// por design) pular dados novos adicionados ao seed depois daquela execução
// (ver e2e/reset-e2e-db.mjs para o caso real que isso causou).
const apiCommand = [
  'node e2e/reset-e2e-db.mjs',
  'pnpm --filter @forge/database db:migrate',
  'pnpm --filter @forge/database db:seed',
  'pnpm --filter @forge/api run start',
].join(' && ');

// O proxy same-origin (`src/app/api/[...path]/route.ts`) lê `API_INTERNAL_URL`
// de `process.env` quando o módulo carrega, não em build time — diferente
// do antigo `rewrites()`, um `next start` reaproveitando um build anterior
// já pegaria a env var certa. Mesmo assim, o build entra na cadeia do
// webServer (junto com `reuseExistingServer: false` abaixo): garante que
// cada rodada da suíte testa o código fonte atual, não um artefato de build
// antigo deixado por uma execução anterior.
const webCommand = [
  'pnpm --filter @forge/web exec next build',
  `pnpm --filter @forge/web exec next start -p ${E2E_WEB_PORT}`,
].join(' && ');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'dot' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Dois servidores reais: a API NestJS (contra o PGlite isolado do e2e,
  // porta fora da faixa 3000-3002/5183 usada pela sessão paralela de outro
  // projeto nesta máquina) e o Next.js (apontando o proxy same-origin
  // `/api/*` para essa API via API_INTERNAL_URL). Nenhum dos dois é mock.
  webServer: [
    {
      command: apiCommand,
      url: `${E2E_API_URL}/`,
      // Sempre relançado (nunca reaproveita um processo já rodando): um
      // processo antigo da API ainda vivo na mesma porta poderia segurar
      // um handle de arquivo do PGlite e travar a migração/seed deste
      // comando, ou o teste rodaria contra o processo antigo sem as
      // mudanças mais recentes.
      reuseExistingServer: false,
      // Migração + seed + boot do Nest encadeados podem passar de 60s a
      // frio (primeira compilação TypeScript do `nest start`).
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        DATABASE_LOCAL_PATH: E2E_DATABASE_LOCAL_PATH,
        API_PORT: String(E2E_API_PORT),
      },
    },
    {
      command: webCommand,
      url: `http://127.0.0.1:${E2E_WEB_PORT}`,
      // Precisa ser `false`: reaproveitar um processo já rodando pularia o
      // rebuild acima e testaria contra uma porta de API (`E2E_API_URL`)
      // possivelmente diferente da deste run.
      reuseExistingServer: false,
      // Rebuild completo (Turbopack) + boot do `next start` encadeados.
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        API_INTERNAL_URL: E2E_API_URL,
      },
    },
  ],
});
