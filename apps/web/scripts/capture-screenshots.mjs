/**
 * Gera os screenshots de `docs/screenshots/` a partir de um Forge rodando.
 *
 *   BASE_URL=http://127.0.0.1:3200 pnpm --filter @forge/web screenshots
 *
 * Requer web + API no ar, banco semeado (`db:seed`) e, para as capturas de
 * aprovação, uma execução de IA parada em `approval_required` na tarefa
 * "Estornos aparecem como cobrança positiva na fatura" (basta disparar uma).
 * Usa o build de produção (`next start`) para não capturar o indicador do
 * `next dev`.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3200';
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots');
mkdirSync(OUT_DIR, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const browser = await chromium.launch();

async function newPage(colorScheme, viewport = DESKTOP) {
  const context = await browser.newContext({ viewport, colorScheme, locale: 'pt-BR', deviceScaleFactor: 1 });
  const page = await context.newPage();
  return { context, page };
}

async function login(page, email = 'tech-lead@acme-platform.example') {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/projects');
  await page.getByRole('heading', { name: 'Projetos', level: 1 }).waitFor();
}

async function settle(page, ms = 600) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

async function shot(page, name, { fullPage = false } = {}) {
  await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`), fullPage });
  console.log('capturado', name);
}

async function api(page, path) {
  const response = await page.request.get(`${BASE_URL}/api${path}`);
  if (!response.ok()) throw new Error(`GET ${path} -> ${response.status()}`);
  return response.json();
}

// ---- telas sem sessão
for (const scheme of ['dark', 'light']) {
  const { context, page } = await newPage(scheme);
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await settle(page);
  await shot(page, `01-login-${scheme}`);
  await context.close();
}

// ---- telas autenticadas (tema escuro, o padrão de apresentação)
{
  const { context, page } = await newPage('dark');
  await login(page);
  await settle(page);
  await shot(page, '03-projetos-dark');

  const projects = await api(page, '/projects');
  const project = projects.items.find((item) => item.name === 'Forge Web App') ?? projects.items[0];
  const tasks = await api(page, `/projects/${project.id}/tasks`);
  const estornos = tasks.find((task) => task.title.startsWith('Estornos')) ?? tasks[0];
  const runs = await api(page, `/tasks/${estornos.id}/agent-runs`);
  const pendingRun = runs.find((run) => run.status === 'approval_required');
  const completedRun = [...runs].reverse().find((run) => run.status === 'completed');

  await page.getByRole('button', { name: 'Novo projeto' }).click();
  await page.getByTestId('new-project-form').getByLabel('Nome').fill('Plataforma de Pagamentos');
  await page.getByTestId('new-project-form').getByLabel('Descrição').fill('Serviço de cobrança e conciliação de faturas.');
  await page.getByTestId('new-project-form').getByLabel('Linguagens').fill('typescript');
  await page.getByTestId('new-project-form').getByLabel('Frameworks').fill('nestjs, next.js');
  await settle(page, 300);
  await shot(page, '15-novo-projeto-dark');

  await page.goto(`${BASE_URL}/projects/${project.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Conhecimento' }).waitFor();
  await settle(page, 800);
  await shot(page, '05-projeto-detalhe-dark', { fullPage: true });

  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('user-menu').waitFor();
  await shot(page, '06-menu-usuario-dark');
  await page.keyboard.press('Escape');

  await page.goto(`${BASE_URL}/projects/${project.id}/code`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'format-currency.ts' }).click();
  await page.getByTestId('code-editor').locator('.view-lines').waitFor({ timeout: 30_000 });
  await settle(page, 1500);
  await shot(page, '07-codigo-explorador-dark', { fullPage: true });

  await page.getByRole('button', { name: /^Diff/ }).click();
  await page.getByTestId('diff-editor').locator('.view-lines').first().waitFor({ timeout: 30_000 });
  await settle(page, 1500);
  await shot(page, '08-codigo-diff-dark', { fullPage: true });

  if (completedRun) {
    await page.goto(`${BASE_URL}/projects/${project.id}/tasks/${estornos.id}/runs/${completedRun.id}`, { waitUntil: 'networkidle' });
    await settle(page, 1000);
    await shot(page, '09-execucao-timeline-dark', { fullPage: true });
  }

  if (pendingRun) {
    await page.goto(`${BASE_URL}/projects/${project.id}/tasks/${estornos.id}/runs/${pendingRun.id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Aprovar' }).first().waitFor({ timeout: 30_000 });
    await settle(page, 1000);
    await shot(page, '10-execucao-aprovacao-dark', { fullPage: true });

    await page.goto(`${BASE_URL}/approvals`, { waitUntil: 'networkidle' });
    await settle(page, 800);
    await shot(page, '11-aprovacoes-dark');
  }

  await page.goto(`${BASE_URL}/ai-usage`, { waitUntil: 'networkidle' });
  await settle(page, 800);
  await shot(page, '12-uso-ia-dark', { fullPage: true });

  await page.goto(`${BASE_URL}/ai-playground`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Comparar modelos' }).click();
  await page.getByRole('heading', { name: 'Scorecard' }).waitFor({ timeout: 30_000 });
  await settle(page, 800);
  await shot(page, '13-playground-scorecard-dark', { fullPage: true });

  await page.goto(`${BASE_URL}/audit-logs`, { waitUntil: 'networkidle' });
  await settle(page, 800);
  await shot(page, '14-auditoria-dark');

  await context.close();
}

// ---- tema claro
{
  const { context, page } = await newPage('light');
  await login(page);
  await settle(page);
  await shot(page, '04-projetos-light');

  const projects = await api(page, '/projects');
  const project = projects.items.find((item) => item.name === 'Forge Web App') ?? projects.items[0];
  await page.goto(`${BASE_URL}/projects/${project.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Conhecimento' }).waitFor();
  await settle(page, 800);
  await shot(page, '16-projeto-detalhe-light', { fullPage: true });
  await context.close();
}

// ---- mobile
{
  const { context, page } = await newPage('dark', MOBILE);
  await login(page);
  await settle(page);
  await shot(page, '17-mobile-projetos-dark');
  await page.getByRole('button', { name: 'Abrir menu de navegação' }).click();
  await settle(page, 400);
  await shot(page, '18-mobile-menu-dark');
  await context.close();
}

await browser.close();
console.log('screenshots em', OUT_DIR);
