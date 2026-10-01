import { createHmac } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const PASSWORD = 'senha-forte-123';

async function loginAs(page: Page, email: string, password = 'demo1234') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Cria um usuário NÃO-demo (convite aceito), pois contas de demonstração não usam 2FA nem encerram sessões. */
async function createRegularUser(browser: Browser, label: string): Promise<string> {
  const email = `${label}.${Date.now()}@externo.example`;
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await loginAs(admin, 'admin@acme-platform.example');
  await expect(admin).toHaveURL('/projects');
  const invitation = (await (await admin.request.post('/api/invitations', { data: { email, role: 'developer' } })).json()) as { token: string };
  await adminContext.close();

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const accepted = await guest.request.post('/api/invitations/accept', { data: { token: invitation.token, name: 'Pessoa Segura', password: PASSWORD } });
  expect(accepted.ok()).toBe(true);
  await guestContext.close();
  return email;
}

function base32Decode(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret: string, offsetSeconds = 0): string {
  const counter = Math.floor((Date.now() / 1000 + offsetSeconds) / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = ((hmac[offset]! & 0x7f) << 24) | (hmac[offset + 1]! << 16) | (hmac[offset + 2]! << 8) | hmac[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, '0');
}

async function newSession(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, email, PASSWORD);
  await expect(page).toHaveURL('/projects');
  return { context, page };
}

test('acesso vencido é renovado sozinho pelo refresh, sem pedir login', async ({ browser }) => {
  const email = await createRegularUser(browser, 'refresh');
  const { context, page } = await newSession(browser, email);

  // Corrompe o JWT de acesso (como se tivesse vencido); o cookie de refresh continua válido.
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'forge_session');
  expect(session).toBeDefined();
  await context.addCookies([{ ...session!, value: 'jwt.vencido.invalido' }]);

  await page.goto('/projects');
  await expect(page).toHaveURL('/projects');
  await expect(page.getByRole('heading', { name: 'Projetos', level: 1 })).toBeVisible();
  const renewed = (await context.cookies()).find((cookie) => cookie.name === 'forge_session');
  expect(renewed?.value).not.toBe('jwt.vencido.invalido');
  await context.close();
});

test('sessão encerrada em outro dispositivo derruba este na próxima ação', async ({ browser }) => {
  const email = await createRegularUser(browser, 'revoke');
  const first = await newSession(browser, email);
  const second = await newSession(browser, email);

  await second.page.goto('/account');
  await expect(second.page.getByRole('heading', { name: 'Minha conta', level: 1 })).toBeVisible();
  const list = second.page.getByTestId('sessions-list');
  await expect(list.locator('li')).toHaveCount(2);
  await second.page.getByRole('button', { name: 'Encerrar todas as outras' }).click();
  await expect(list.locator('li')).toHaveCount(1);

  await first.page.goto('/projects');
  await expect(first.page).toHaveURL(/\/login/);
  await first.context.close();
  await second.context.close();
});

test('2FA: ativar na conta, entrar em dois passos e desativar', async ({ browser }) => {
  const email = await createRegularUser(browser, 'dois-fatores');
  const { context, page } = await newSession(browser, email);

  await page.goto('/account');
  await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click();
  const secret = ((await page.getByTestId('totp-secret').textContent()) ?? '').trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/u);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  // código do passo anterior: aceito na janela e deixa o passo atual livre para o login
  await page.getByLabel('Código de 6 dígitos').fill(totp(secret, -30));
  await page.getByRole('button', { name: 'Confirmar e ativar' }).click();
  const recovery = page.getByTestId('recovery-codes');
  await expect(recovery).toBeVisible();
  const recoveryCode = ((await recovery.locator('li').first().textContent()) ?? '').trim();
  expect(recoveryCode).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/u);
  await context.close();

  // novo login pede o segundo fator
  const loginContext = await browser.newContext();
  const loginPage = await loginContext.newPage();
  await loginAs(loginPage, email, PASSWORD);
  await expect(loginPage.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible();

  await loginPage.getByLabel('Código de verificação').fill('000000');
  await loginPage.getByRole('button', { name: 'Verificar' }).click();
  await expect(loginPage.getByRole('alert')).toContainText('inválido');

  await loginPage.getByLabel('Código de verificação').fill(totp(secret));
  await loginPage.getByRole('button', { name: 'Verificar' }).click();
  await expect(loginPage).toHaveURL('/projects');

  // desativar: senha + código de recuperação
  await loginPage.goto('/account');
  const disable = loginPage.getByRole('form', { name: 'Desativar verificação em duas etapas' });
  await disable.getByLabel('Senha').fill(PASSWORD);
  await disable.getByLabel(/Código/).fill(recoveryCode);
  await disable.getByRole('button', { name: 'Desativar' }).click();
  await expect(loginPage.getByRole('button', { name: 'Ativar verificação em duas etapas' })).toBeVisible();
  await loginContext.close();
});

test('cabeçalhos de segurança do site (CSP, nosniff, sem moldura) e login sem credenciais na URL', async ({ page }) => {
  const response = await page.goto('/login');
  const headers = response?.headers() ?? {};
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBeDefined();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");

  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/iu.test(message.text())) violations.push(message.text());
  });
  await loginAs(page, 'tech-lead@acme-platform.example');
  await expect(page).toHaveURL('/projects');
  await page.goto('/ai-playground');
  await expect(page.getByRole('heading', { name: 'Playground IA' })).toBeVisible();
  expect(violations).toEqual([]);
});
