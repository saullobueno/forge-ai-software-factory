import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('configurações → Agentes: edita instruções, salva e persiste após recarregar', async ({ page }) => {
  const instructions = `Responda sempre em português (${Date.now()}).`;
  await login(page, 'platform@acme-platform.example');
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Agentes' }).click();

  const card = page.getByTestId('agent-card').filter({ hasText: 'Planejar' });
  try {
    await card.getByLabel('Instruções extras').fill(instructions);
    await card.getByRole('button', { name: 'Salvar agente' }).click();
    await expect(card.getByRole('status')).toContainText('Agente salvo.');

    await page.reload();
    await page.getByRole('tab', { name: 'Agentes' }).click();
    await expect(page.getByTestId('agent-card').filter({ hasText: 'Planejar' }).getByLabel('Instruções extras')).toHaveValue(instructions);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
  } finally {
    const again = page.getByTestId('agent-card').filter({ hasText: 'Planejar' });
    await again.getByLabel('Instruções extras').fill('');
    await again.getByRole('button', { name: 'Salvar agente' }).click();
    await expect(again.getByRole('status')).toContainText('Agente salvo.');
  }
});

test('playground: salva dataset, carrega versão, cria nova versão e avalia por versão salva', async ({ page }) => {
  const name = `Dataset ${Date.now()}`;
  await login(page, 'tech-lead@acme-platform.example');
  await page.goto('/ai-playground');

  const panel = page.getByTestId('playground-datasets');
  await panel.getByPlaceholder('Nome do dataset').fill(name);
  await panel.getByRole('button', { name: 'Salvar dataset' }).click();
  await expect(panel.getByRole('status')).toContainText(`Dataset "${name}" salvo (v1).`);

  // nova versão com o editor modificado
  const editor = page.getByRole('textbox', { name: 'Dataset', exact: true });
  const current = await editor.inputValue();
  const items = JSON.parse(current) as { id: string; title: string; input: string; expectedKeywords: string[] }[];
  items[0]!.title = 'Título editado';
  await editor.fill(JSON.stringify(items, null, 2));
  await panel.getByLabel('Nota da nova versão (opcional)').fill('ajuste de título');
  await panel.getByRole('button', { name: 'Salvar como nova versão' }).click();
  await expect(panel.getByRole('status')).toContainText('Nova versão 2 salva.');

  // volta para a v1 e verifica que é imutável (título original)
  await panel.locator('select').nth(1).selectOption('1');
  await panel.getByRole('button', { name: 'Carregar no editor' }).click();
  await expect(panel.getByTestId('loaded-dataset')).toContainText(`${name} v1 — a avaliação usa esta versão salva.`);
  await expect(editor).not.toHaveValue(/Título editado/);

  // avalia com a versão salva
  await page.getByRole('button', { name: 'Comparar modelos' }).click();
  await expect(page.getByRole('heading', { name: 'Scorecard' })).toBeVisible();

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  // limpeza
  await panel.getByRole('button', { name: 'Remover' }).click();
  await expect(panel.getByRole('status')).toContainText('Dataset removido.');
});

test('projeto: escolhe o provedor de IA (só os configurados aparecem) e persiste', async ({ page }) => {
  const stamp = Date.now();
  await login(page, 'tech-lead@acme-platform.example');
  const project = (await (await page.request.post('/api/projects', { data: { name: `Projeto Provedor ${stamp}` } })).json()) as { id: string };

  await page.goto(`/projects/${project.id}`);
  await page.getByRole('button', { name: 'Editar projeto' }).click();
  const form = page.getByTestId('edit-project-form');
  const select = form.getByLabel('Provedor de IA');
  await expect(select.locator('option')).toHaveText(['Padrão do servidor', 'mock']);

  await select.selectOption('mock');
  await form.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(form).toBeHidden();

  const saved = (await (await page.request.get(`/api/projects/${project.id}`)).json()) as { aiProvider: string | null };
  expect(saved.aiProvider).toBe('mock');
});
