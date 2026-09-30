import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('tech lead edita e exclui tarefa e projeto pela interface', async ({ page }) => {
  const stamp = Date.now();
  const projectName = `Projeto Editar ${stamp}`;
  const renamedProject = `Projeto Renomeado ${stamp}`;
  const taskTitle = `Tarefa Editar ${stamp}`;
  const renamedTask = `Tarefa Renomeada ${stamp}`;

  await login(page, 'tech-lead@acme-platform.example');

  await page.getByRole('button', { name: 'Novo projeto' }).click();
  await page.getByTestId('new-project-form').getByLabel('Nome').fill(projectName);
  await page.getByTestId('new-project-form').getByRole('button', { name: 'Criar projeto' }).click();
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  await page.getByRole('button', { name: 'Editar projeto' }).click();
  const editProject = page.getByTestId('edit-project-form');
  await editProject.getByLabel('Nome').fill(renamedProject);
  await editProject.getByLabel('Regras de código').fill('Sem any explícito');
  await editProject.getByLabel('Linguagens').fill('typescript');
  await editProject.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('heading', { name: renamedProject })).toBeVisible();
  await expect(page.getByText('Sem any explícito')).toBeVisible();
  await expect(editProject).toBeHidden();

  await page.getByRole('button', { name: 'Nova tarefa' }).click();
  await page.getByTestId('new-task-form').getByLabel('Título').fill(taskTitle);
  await page.getByTestId('new-task-form').getByRole('button', { name: 'Criar tarefa' }).click();
  await page.getByRole('link', { name: new RegExp(taskTitle) }).click();
  await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible();

  await page.getByRole('button', { name: 'Editar tarefa' }).click();
  const editTask = page.getByTestId('edit-task-form');
  await editTask.getByLabel('Título').fill(renamedTask);
  await editTask.getByLabel('Prioridade').selectOption('urgent');
  await editTask.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('heading', { name: renamedTask })).toBeVisible();
  await expect(page.getByText('Urgente')).toBeVisible();

  await page.getByTestId('delete-task').click();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page.getByRole('heading', { name: renamedProject })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(renamedTask) })).toHaveCount(0);

  await page.getByTestId('delete-project').click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: renamedProject })).toBeVisible();

  await page.getByTestId('delete-project').click();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page).toHaveURL('/projects');
  await expect(page.getByRole('link', { name: new RegExp(renamedProject) })).toHaveCount(0);
});

test('projeto de demonstração é protegido: ninguém vê editar/excluir projeto nem tarefas dele', async ({ page }) => {
  for (const email of ['dev@acme-platform.example', 'tech-lead@acme-platform.example']) {
    await login(page, email);
    await page.getByRole('link', { name: 'Forge Web App' }).first().click();

    await expect(page.getByRole('heading', { name: 'Forge Web App', level: 1 })).toBeVisible();
    await expect(page.getByTestId('protected-project-note')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar projeto' })).toHaveCount(0);
    await expect(page.getByTestId('delete-project')).toHaveCount(0);

    await page.getByRole('link', { name: 'Estornos aparecem como cobrança positiva na fatura' }).click();
    await expect(page.getByRole('heading', { name: /Estornos aparecem/, level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar tarefa' })).toHaveCount(0);
    await expect(page.getByTestId('delete-task')).toHaveCount(0);

    await page.context().clearCookies();
  }
});
