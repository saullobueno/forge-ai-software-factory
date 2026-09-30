import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('página de notificações: tarefa atribuída chega ao responsável, abre a tarefa e marca como lida', async ({ browser }) => {
  const stamp = Date.now();
  const taskTitle = `Notificada Alfa ${stamp}`;
  const secondTitle = `Notificada Beta ${stamp}`;

  // tech lead cria uma tarefa e atribui ao developer (via API da própria sessão)
  const leadContext = await browser.newContext();
  const leadPage = await leadContext.newPage();
  await login(leadPage, 'tech-lead@acme-platform.example');
  const users = (await (await leadPage.request.get('/api/users')).json()) as { id: string; email: string }[];
  const dev = users.find((user) => user.email === 'dev@acme-platform.example');
  expect(dev).toBeDefined();
  const project = (await (await leadPage.request.post('/api/projects', { data: { name: `Projeto Notificações ${stamp}` } })).json()) as { id: string };
  const task = (await (
    await leadPage.request.post(`/api/projects/${project.id}/tasks`, { data: { title: taskTitle, assigneeId: dev?.id } })
  ).json()) as { id: string };
  await leadPage.request.post(`/api/projects/${project.id}/tasks`, { data: { title: secondTitle, assigneeId: dev?.id } });
  await leadContext.close();

  const devContext = await browser.newContext();
  const page = await devContext.newPage();
  await login(page, 'dev@acme-platform.example');
  await page.goto('/notifications');

  const item = page.getByTestId('notification-item').filter({ hasText: taskTitle });
  await expect(item).toContainText('Nova');
  await item.getByRole('link', { name: new RegExp(taskTitle) }).click();
  await expect(page).toHaveURL(`/projects/${project.id}/tasks/${task.id}`);

  await page.goto('/notifications');
  const first = page.getByTestId('notification-item').filter({ hasText: taskTitle });
  await expect(first).not.toContainText('Nova');
  const second = page.getByTestId('notification-item').filter({ hasText: secondTitle });
  await expect(second).toContainText('Nova');

  await page.getByRole('button', { name: 'Marcar todas como lidas' }).click();
  await expect(page.getByRole('button', { name: 'Marcar todas como lidas' })).toBeDisabled();
  await expect(second).not.toContainText('Nova');
  await devContext.close();
});
