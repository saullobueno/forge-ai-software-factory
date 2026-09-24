import { devices, expect, test } from '@playwright/test';

/**
 * Fase 15 (performance/acessibilidade) — verificação responsiva real (não
 * redesign): confirma que o layout autenticado continua utilizável em
 * viewports estreitos, usando a emulação de dispositivo real do
 * Playwright (`devices['iPhone 13']`/`devices['iPad Mini']`), não números
 * de viewport inventados. Encontrou um problema real ao navegar: a
 * sidebar de `apps/web/src/app/(product)/layout.tsx` era `w-56 shrink-0`
 * sem nenhum tratamento responsivo — corrigido com um drawer mobile
 * (mesmo arquivo, ver comentário lá) antes deste teste ser escrito para
 * passar de verdade, não read-and-adjust-the-test.
 *
 * Só reaproveita `viewport`/`isMobile`/`hasTouch`/`deviceScaleFactor` de
 * cada preset (não o objeto inteiro): `devices['iPhone 13']` e
 * `devices['iPad Mini']` também trazem `defaultBrowserType: 'webkit'`, e o
 * Playwright rejeita sobrescrever `defaultBrowserType` dentro de um
 * `test.describe` ("Cannot use({ defaultBrowserType }) in a describe
 * group... Make it top-level in the configuration file") — o único
 * projeto configurado em `playwright.config.ts` é `chromium`, e não faz
 * sentido trocar de engine só para emular um viewport.
 */
function pickViewportEmulation(device: (typeof devices)[string]) {
  const { viewport, isMobile, hasTouch, deviceScaleFactor } = device;
  return { viewport, isMobile, hasTouch, deviceScaleFactor };
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // Pequena folga (1px) por arredondamento de subpixel entre navegadores.
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('responsivo: /projects em viewport mobile', () => {
  test.use(pickViewportEmulation(devices['iPhone 13']));

  test('sidebar vira menu recolhível, lista de projetos não estoura a tela e continua clicável', async ({
    page,
  }) => {
    await login(page);
    await expectNoHorizontalOverflow(page);

    // A sidebar de desktop não fica só visualmente escondida — some da
    // árvore de acessibilidade (display: none), então o link "Projetos" de
    // dentro dela não deve estar visível nem alcançável por padrão.
    const projectsNavLink = page.getByRole('navigation', { name: 'navegação principal' }).getByRole('link', {
      name: 'Projetos',
    });
    await expect(projectsNavLink).toBeHidden();

    const menuToggle = page.getByRole('button', { name: 'Abrir menu de navegação' });
    await expect(menuToggle).toBeVisible();
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    await menuToggle.click();
    await expect(page.getByRole('button', { name: 'Fechar menu de navegação' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(projectsNavLink).toBeVisible();
    await expect(projectsNavLink).toBeFocused();
    await expectNoHorizontalOverflow(page);

    // Escape fecha o drawer e devolve o foco ao botão que o abriu — mesma
    // disciplina de gerenciamento de foco já cobrada pelos outros testes de
    // acessibilidade desta suíte.
    await page.keyboard.press('Escape');
    const menuToggleAfterClose = page.getByRole('button', { name: 'Abrir menu de navegação' });
    await expect(menuToggleAfterClose).toHaveAttribute('aria-expanded', 'false');
    await expect(menuToggleAfterClose).toBeFocused();
    await expect(projectsNavLink).toBeHidden();

    // O card do projeto demo continua visível e clicável sem o menu aberto
    // — o conteúdo principal, não só a navegação, precisa caber na tela.
    const projectCard = page.getByRole('link', { name: /Forge Web App/ });
    await expect(projectCard).toBeVisible();
    await projectCard.click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  });
});

test.describe('responsivo: timeline de execução em viewport tablet', () => {
  test.use(pickViewportEmulation(devices['iPad Mini']));

  test('timeline da execução seedada continua legível e os controles continuam clicáveis', async ({ page }) => {
    test.setTimeout(60_000);

    await login(page);
    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await page
      .getByRole('link', { name: 'Estornos aparecem como cobrança positiva na fatura' })
      .click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}$/);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: /Corrigir o bug de formatação de moeda/ }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}\/runs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Execução de IA' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Os 6 steps seedados continuam visíveis e expansíveis sem que o
    // conteúdo (findings, tool calls) precise de scroll horizontal.
    const steps = page.getByTestId('agent-step');
    await expect(steps).toHaveCount(6);
    const reviewerStep = steps.filter({ hasText: 'Revisar diff e produzir findings' });
    await expect(reviewerStep).toBeVisible();
    await reviewerStep.click();
    await expect(reviewerStep.getByText('Correção do bug de sinal confirmada')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Artefato real seedado continua clicável nessa largura.
    const artifactButton = page.getByRole('button', { name: 'Ver conteúdo' });
    await expect(artifactButton).toBeVisible();
    await artifactButton.click();
    await expect(page.getByTestId('artifact-content')).toContainText('Tests  6 passed (6)');
    await expectNoHorizontalOverflow(page);
  });
});
