import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('dependências entre tarefas: adicionar, bloquear ciclo e remover', async ({ page }) => {
  const stamp = Date.now();
  const titleA = `Dep A ${stamp}`;
  const titleB = `Dep B ${stamp}`;

  await login(page);
  const project = await page.request.post('/api/projects', { data: { name: `Projeto Dependências ${stamp}` } });
  const { id: projectId } = (await project.json()) as { id: string };
  const taskA = (await (await page.request.post(`/api/projects/${projectId}/tasks`, { data: { title: titleA } })).json()) as { id: string };
  const taskB = (await (await page.request.post(`/api/projects/${projectId}/tasks`, { data: { title: titleB } })).json()) as { id: string };

  await page.goto(`/projects/${projectId}/tasks/${taskA.id}`);
  const section = page.getByTestId('task-dependencies');
  await expect(section).toContainText('não depende de nenhuma outra');

  await section.getByLabel('Depende de').selectOption({ label: titleB });
  await section.getByRole('button', { name: 'Adicionar dependência' }).click();
  await expect(section.getByRole('link', { name: titleB })).toBeVisible();
  await expect(section.getByLabel('Depende de')).toHaveCount(0);

  // B -> A criaria um ciclo (A já depende de B)
  await page.goto(`/projects/${projectId}/tasks/${taskB.id}`);
  const sectionB = page.getByTestId('task-dependencies');
  await sectionB.getByLabel('Depende de').selectOption({ label: titleA });
  await sectionB.getByRole('button', { name: 'Adicionar dependência' }).click();
  await expect(sectionB.getByRole('alert')).toContainText('ciclo');

  await page.goto(`/projects/${projectId}/tasks/${taskA.id}`);
  await page.getByRole('button', { name: `Remover dependência de "${titleB}"` }).click();
  await expect(page.getByTestId('task-dependencies')).toContainText('não depende de nenhuma outra');
});
