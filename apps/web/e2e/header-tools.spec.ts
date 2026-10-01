import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('cabeçalho: botão de busca abre a paleta e o menu Configurações leva à tela', async ({ page }) => {
  await login(page, 'admin@acme-platform.example');

  await page.getByTestId('open-search').click();
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('navigation', { name: 'navegação principal' }).getByRole('link', { name: 'Configurações' }).click();
  await expect(page).toHaveURL('/settings');
  await expect(page.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();
});

test('cabeçalho: sino mostra a notificação nova, abre a tarefa e zera o contador', async ({ browser }) => {
  const stamp = Date.now();
  const title = `Sino ${stamp}`;

  const leadContext = await browser.newContext();
  const lead = await leadContext.newPage();
  await login(lead, 'tech-lead@acme-platform.example');
  const users = (await (await lead.request.get('/api/users')).json()) as { id: string; email: string }[];
  const dev = users.find((user) => user.email === 'dev@acme-platform.example');
  const project = (await (await lead.request.post('/api/projects', { data: { name: `Projeto Sino ${stamp}` } })).json()) as { id: string };
  const task = (await (
    await lead.request.post(`/api/projects/${project.id}/tasks`, { data: { title, assigneeId: dev?.id } })
  ).json()) as { id: string };
  await leadContext.close();

  const devContext = await browser.newContext();
  const page = await devContext.newPage();
  await login(page, 'dev@acme-platform.example');

  const bell = page.getByTestId('notification-bell');
  await expect(page.getByTestId('notification-badge')).toBeVisible();
  await bell.click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toContainText(title);

  const axe = await new AxeBuilder({ page }).include('[data-testid="notification-panel"]').analyze();
  expect(axe.violations).toEqual([]);

  await panel.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(`/projects/${project.id}/tasks/${task.id}`);

  // abrir pelo painel já marcou como lida: o contador some
  await expect(page.getByTestId('notification-badge')).toHaveCount(0);
  await devContext.close();
});
