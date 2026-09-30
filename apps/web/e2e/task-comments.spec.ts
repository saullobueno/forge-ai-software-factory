import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email = 'tech-lead@acme-platform.example') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('comentários e atividade: comentar, ver no histórico e apagar', async ({ page }) => {
  const stamp = Date.now();
  await login(page);
  const project = (await (await page.request.post('/api/projects', { data: { name: `Projeto Comentários ${stamp}` } })).json()) as { id: string };
  const task = (await (await page.request.post(`/api/projects/${project.id}/tasks`, { data: { title: `Tarefa Comentários ${stamp}` } })).json()) as { id: string };

  await page.goto(`/projects/${project.id}/tasks/${task.id}`);
  const comments = page.getByTestId('task-comments');
  await expect(comments).toContainText('Nenhum comentário ainda.');

  await comments.getByLabel('Escreva um comentário').fill(`Primeiro comentário ${stamp}`);
  await comments.getByRole('button', { name: 'Comentar' }).click();
  await expect(comments.getByTestId('task-comment')).toContainText(`Primeiro comentário ${stamp}`);
  await expect(comments.getByTestId('task-comment')).toContainText('Ana Tech Lead');

  await page.getByRole('button', { name: 'Editar tarefa' }).click();
  await page.getByTestId('edit-task-form').getByLabel('Prioridade').selectOption('urgent');
  await page.getByTestId('edit-task-form').getByRole('button', { name: 'Salvar alterações' }).click();

  const activity = page.getByTestId('task-activity');
  await expect(activity).toContainText('criou a tarefa');
  await expect(activity).toContainText('comentou');
  await expect(activity).toContainText('editou');
  await expect(activity).toContainText('prioridade');

  await comments.getByRole('button', { name: 'Apagar comentário' }).click();
  await expect(comments).toContainText('Nenhum comentário ainda.');
  await expect(activity).toContainText('apagou um comentário');
});

test('comentários ficam desativados nas tarefas do projeto de demonstração', async ({ page }) => {
  await login(page, 'dev@acme-platform.example');
  await page.getByRole('link', { name: 'Forge Web App' }).first().click();
  await page.getByRole('link', { name: 'Estornos aparecem como cobrança positiva na fatura' }).click();

  const comments = page.getByTestId('task-comments');
  await expect(comments).toContainText('desativados');
  await expect(comments.getByRole('button', { name: 'Comentar' })).toHaveCount(0);
  await expect(page.getByTestId('task-activity')).toBeVisible();
});
