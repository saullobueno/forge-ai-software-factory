import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('tech lead cria um projeto e uma tarefa pela interface', async ({ page }) => {
  const projectName = `Projeto E2E ${Date.now()}`;
  const taskTitle = `Tarefa E2E ${Date.now()}`;

  await login(page, 'tech-lead@acme-platform.example');

  await page.getByRole('button', { name: 'Novo projeto' }).click();
  const form = page.getByTestId('new-project-form');
  await form.getByLabel('Nome').fill(projectName);
  await form.getByLabel('Descrição').fill('Criado pelo teste e2e');
  await form.getByLabel('Linguagens').fill('typescript, python');
  await form.getByLabel('Frameworks').fill('next.js');
  await form.getByRole('button', { name: 'Criar projeto' }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
  await expect(page.getByText('Nenhuma tarefa neste projeto ainda.')).toBeVisible();

  await page.getByRole('button', { name: 'Nova tarefa' }).click();
  const taskForm = page.getByTestId('new-task-form');
  await taskForm.getByLabel('Título').fill(taskTitle);
  await taskForm.getByLabel('Critérios de aceite').fill('Deve aparecer na lista');
  await taskForm.getByLabel('Prioridade').selectOption('high');
  await taskForm.getByRole('button', { name: 'Criar tarefa' }).click();

  await expect(page.getByRole('link', { name: new RegExp(taskTitle) })).toBeVisible();
  await expect(taskForm).toBeHidden();

  await page.goto('/projects');
  await expect(page.getByRole('link', { name: new RegExp(projectName) })).toBeVisible();
});

test('developer pode criar tarefas, mas não vê o botão de novo projeto', async ({ page }) => {
  await login(page, 'dev@acme-platform.example');

  await expect(page.getByRole('heading', { name: 'Projetos', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo projeto' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Forge Web App' }).first().click();
  await expect(page.getByRole('button', { name: 'Nova tarefa' })).toBeVisible();
});
