import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('responsável e etiquetas: criar, editar, ver no Kanban e filtrar', async ({ page }) => {
  const stamp = Date.now();
  const projectName = `Projeto Responsável ${stamp}`;
  const taskTitle = `Tarefa Responsável ${stamp}`;

  await login(page);
  const created = await page.request.post('/api/projects', { data: { name: projectName } });
  expect(created.ok()).toBe(true);
  const { id: projectId } = (await created.json()) as { id: string };

  await page.goto(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'Nova tarefa' }).click();
  const form = page.getByTestId('new-task-form');
  await form.getByLabel('Título').fill(taskTitle);
  await form.getByLabel('Responsável').selectOption({ label: 'Ana Tech Lead' });
  await form.getByLabel('Etiquetas').fill('backend, urgente');
  await form.getByRole('button', { name: 'Criar tarefa' }).click();

  await page.getByRole('link', { name: new RegExp(taskTitle) }).click();
  await expect(page.getByTestId('task-assignee')).toContainText('Ana Tech Lead');
  await expect(page.getByText('backend', { exact: true })).toBeVisible();
  await expect(page.getByText('urgente', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Editar tarefa' }).click();
  const edit = page.getByTestId('edit-task-form');
  await edit.getByLabel('Responsável').selectOption('');
  await edit.getByLabel('Etiquetas').fill('frontend');
  await edit.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByTestId('task-assignee')).toContainText('ninguém');
  await expect(page.getByText('frontend', { exact: true })).toBeVisible();

  await page.goto('/tasks');
  await page.getByTestId('view-list').click();
  await page.getByLabel('Buscar por título').fill(String(stamp));
  await page.getByLabel('Responsável').selectOption('none');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.locator('table')).toContainText(taskTitle);

  await page.getByLabel('Responsável').selectOption({ label: 'Ana Tech Lead' });
  await expect(page.getByText('Nenhuma tarefa encontrada com esses filtros.')).toBeVisible();
});
