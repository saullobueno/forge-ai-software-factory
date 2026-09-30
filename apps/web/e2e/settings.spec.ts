import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string, password = 'demo1234') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

test('configurações: convite ponta a ponta, papel, remoção e contas de demonstração protegidas', async ({ browser }) => {
  const stamp = Date.now();
  const email = `convidado.${stamp}@externo.example`;

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await login(admin, 'admin@acme-platform.example');
  await admin.goto('/settings');
  await expect(admin.getByRole('heading', { name: 'Configurações', level: 1 })).toBeVisible();

  // contas de demonstração não podem ser alteradas
  const demoRow = admin.getByTestId('member-row').filter({ hasText: 'dev@acme-platform.example' });
  await expect(demoRow.getByRole('combobox')).toBeDisabled();
  await expect(demoRow).toContainText('Demo');

  const axeResults = await new AxeBuilder({ page: admin }).analyze();
  expect(axeResults.violations).toEqual([]);

  // cria o convite e captura o link (exibido uma única vez)
  await admin.getByRole('tab', { name: 'Convites' }).click();
  await admin.getByLabel('E-mail').fill(email);
  await admin.getByLabel('Papel').selectOption('qa_engineer');
  await admin.getByRole('button', { name: 'Criar convite' }).click();
  const link = (await admin.getByTestId('invite-link').locator('code').textContent()) ?? '';
  expect(link).toContain('/accept-invite?token=');
  await expect(admin.getByTestId('invitations-list')).toContainText(email);

  // a pessoa convidada aceita (contexto anônimo) e entra
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(link);
  await expect(guest.getByText('Desenvolvedor').or(guest.getByText('QA'))).toBeVisible();
  await guest.getByLabel('Nome').fill('Pessoa Convidada');
  await guest.getByLabel(/Senha/).fill('senha-forte-123');
  await guest.getByRole('button', { name: 'Criar conta' }).click();
  await expect(guest.getByText('Conta criada com sucesso.')).toBeVisible();
  await guestContext.close();

  // o mesmo link não funciona mais
  const again = await browser.newContext();
  const reused = await again.newPage();
  await reused.goto(link);
  await expect(reused.getByRole('alert')).toContainText('Convite inválido');
  await again.close();

  // a nova conta aparece em Usuários; admin troca o papel e remove
  await admin.goto('/settings');
  const row = admin.getByTestId('member-row').filter({ hasText: email });
  await expect(row).toBeVisible();
  await row.getByRole('combobox').selectOption('developer');
  await expect(row.getByRole('combobox')).toHaveValue('developer');
  await row.getByRole('button', { name: 'Remover' }).click();
  await row.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(admin.getByTestId('member-row').filter({ hasText: email })).toHaveCount(0);
  await adminContext.close();
});

test('configurações: matriz de papéis e políticas de ferramentas (só mais restritivo)', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, 'admin@acme-platform.example');
  await page.goto('/settings');

  await page.getByRole('tab', { name: 'Papéis' }).click();
  await expect(page.getByTestId('roles-matrix')).toContainText('member:manage');

  await page.getByRole('tab', { name: 'Políticas' }).click();
  const select = page.getByLabel('Decisão para inspect_git');
  try {
    await select.selectOption('require_approval');
    await expect(select).toHaveValue('require_approval');
    await page.reload();
    await page.getByRole('tab', { name: 'Políticas' }).click();
    await expect(page.getByLabel('Decisão para inspect_git')).toHaveValue('require_approval');
    // uma ferramenta que já exige aprovação não oferece "Permitir"
    const write = page.getByLabel('Decisão para write_file');
    await expect(write.locator('option', { hasText: 'Permitir' })).toHaveCount(0);
  } finally {
    await page.getByLabel('Decisão para inspect_git').selectOption('allow');
    await expect(page.getByLabel('Decisão para inspect_git')).toHaveValue('allow');
  }
  await context.close();
});

test('configurações: papel sem acesso vê aviso e platform_engineer só vê Políticas', async ({ browser }) => {
  const devContext = await browser.newContext();
  const dev = await devContext.newPage();
  await login(dev, 'dev@acme-platform.example');
  await dev.goto('/settings');
  await expect(dev.getByRole('status')).toContainText('não tem acesso');
  await expect(dev.getByRole('tab')).toHaveCount(0);
  await devContext.close();

  const platformContext = await browser.newContext();
  const platform = await platformContext.newPage();
  await login(platform, 'platform@acme-platform.example');
  await platform.goto('/settings');
  await expect(platform.getByRole('tab')).toHaveCount(1);
  await expect(platform.getByRole('tab', { name: 'Políticas' })).toBeVisible();
  await platformContext.close();
});
