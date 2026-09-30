import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email = 'tech-lead@acme-platform.example') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

async function createProjectWithTask(page: Page, projectName: string, taskTitle: string): Promise<void> {
  const project = await page.request.post('/api/projects', { data: { name: projectName } });
  expect(project.ok()).toBe(true);
  const { id } = (await project.json()) as { id: string };
  const task = await page.request.post(`/api/projects/${id}/tasks`, { data: { title: taskTitle, priority: 'high' } });
  expect(task.ok()).toBe(true);
}

test('Kanban: mover por seletor e por arrastar, com transição inválida bloqueada', async ({ page }) => {
  const stamp = Date.now();
  const projectName = `Projeto Kanban ${stamp}`;
  const taskTitle = `Tarefa Kanban ${stamp}`;

  // As 8 colunas não cabem em 1280px e o Playwright não rola durante um arrasto:
  // uma janela larga deixa origem e destino visíveis ao mesmo tempo.
  await page.setViewportSize({ width: 2300, height: 900 });
  await login(page);
  await createProjectWithTask(page, projectName, taskTitle);

  await page.getByRole('link', { name: 'Tarefas', exact: true }).click();
  await expect(page).toHaveURL('/tasks');
  await expect(page.getByTestId('kanban-board')).toBeVisible();

  const card = page.locator('article', { hasText: taskTitle });
  await expect(page.getByTestId('column-ready')).toContainText(taskTitle);

  // tarefas do projeto de demonstração são só leitura
  const demoCard = page.locator('article', { hasText: 'Configurar autenticação de usuários' });
  await expect(demoCard).toContainText('Demo');
  await expect(demoCard.getByRole('combobox')).toHaveCount(0);

  // mover por seletor (acessível por teclado)
  await card.getByLabel(new RegExp(`Mover "${taskTitle}" para`)).selectOption('planning');
  await expect(page.getByTestId('column-planning')).toContainText(taskTitle);
  await expect(page.getByTestId('kanban-feedback')).toContainText('Planejamento');

  // mover arrastando (planning -> in_progress é permitido)
  await page.locator('article', { hasText: taskTitle }).dragTo(page.getByTestId('column-in_progress'));
  await expect(page.getByTestId('column-in_progress')).toContainText(taskTitle);

  // in_progress -> done não é permitido pela máquina de estados
  await page.locator('article', { hasText: taskTitle }).dragTo(page.getByTestId('column-done'));
  await expect(page.getByTestId('kanban-feedback')).toContainText('Não dá para ir');
  await expect(page.getByTestId('column-in_progress')).toContainText(taskTitle);
});

test('lista de tarefas: filtros por texto, prioridade e status', async ({ page }) => {
  const stamp = Date.now();
  const taskTitle = `Tarefa Lista ${stamp}`;

  await login(page);
  await createProjectWithTask(page, `Projeto Lista ${stamp}`, taskTitle);

  await page.goto('/tasks');
  await page.getByTestId('view-list').click();

  await page.getByLabel('Buscar por título').fill(String(stamp));
  await page.getByRole('button', { name: 'Buscar' }).click();
  const table = page.locator('table');
  await expect(table).toContainText(taskTitle);
  await expect(table.locator('tbody tr')).toHaveCount(1);

  await page.getByLabel('Prioridade').selectOption('low');
  await expect(page.getByText('Nenhuma tarefa encontrada com esses filtros.')).toBeVisible();

  await page.getByLabel('Prioridade').selectOption('high');
  await page.getByLabel('Status').selectOption('ready');
  await expect(table).toContainText(taskTitle);

  await table.getByRole('link', { name: taskTitle }).click();
  await expect(page.getByRole('heading', { name: taskTitle, level: 1 })).toBeVisible();
});

test('Execuções de IA: lista global com filtro por status e link para o detalhe', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Execuções de IA', exact: true }).click();
  await expect(page).toHaveURL('/agent-runs');

  const table = page.getByTestId('runs-table');
  await expect(table).toBeVisible();
  await expect(table).toContainText('Estornos aparecem como cobrança positiva na fatura');

  await page.getByLabel('Status').selectOption('failed');
  await expect(page.getByText('Nenhuma execução encontrada com esses filtros.')).toBeVisible();

  await page.getByLabel('Status').selectOption('completed');
  await expect(table).toBeVisible();
  await table.getByRole('link', { name: /Implementar|Estornos|Corrigir/ }).first().click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}\/runs\/[0-9a-f-]{36}$/);
});

test('developer acessa o Kanban e a lista de execuções', async ({ page }) => {
  await login(page, 'dev@acme-platform.example');
  await page.goto('/tasks');
  await expect(page.getByTestId('kanban-board')).toBeVisible();
  await page.goto('/agent-runs');
  await expect(page.getByTestId('runs-table')).toBeVisible();
});
