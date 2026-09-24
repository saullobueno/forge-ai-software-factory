import { chromium as playwrightChromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import lighthouse, { desktopConfig } from 'lighthouse';
import puppeteer from 'puppeteer-core';

/**
 * Fase 15 (performance/acessibilidade) — auditoria Lighthouse REAL (não
 * simulada) contra 3 rotas autenticadas reais, rodando contra os mesmos
 * dois servidores reais (API + Next.js) que o resto da suíte Playwright já
 * sobe (ver playwright.config.ts) — nenhuma configuração paralela.
 *
 * Por que Puppeteer além do Playwright, se o resto da suíte só usa
 * Playwright: a API Node do Lighthouse (`lighthouse(url, flags, config,
 * page)`) só aceita uma `Page` do Puppeteer como 4º argumento — é assim
 * que se audita uma página JÁ AUTENTICADA sem que o Lighthouse limpe a
 * sessão antes de medir (receita oficial:
 * https://github.com/GoogleChrome/lighthouse/blob/main/docs/recipes/auth/README.md).
 * Um objeto `Page` do Playwright não serve para essa chamada (protocolos
 * de automação distintos, tipos incompatíveis).
 *
 * Para não precisar baixar um segundo Chromium só para isso, o Puppeteer
 * é apontado (`executablePath`) para o MESMO binário que o Playwright já
 * baixa e usa no resto da suíte (`chromium.executablePath()`). Login é
 * feito de verdade via `/login` com o `page` do Playwright (mesmo padrão
 * de todos os outros specs desta suíte) — os cookies de sessão resultantes
 * (`context.cookies()`) são então repassados para o Chrome do Puppeteer
 * (`disableStorageReset: true` no Lighthouse preserva esses cookies em vez
 * de limpar o storage antes de auditar).
 */

const REPORTS_DIR = path.join(__dirname, '../lighthouse-reports');

interface Budget {
  performance: number;
  accessibility: number;
  bestPractices: number;
}

/**
 * Orçamentos calibrados a partir de uma rodada real (não estimada) do
 * Lighthouse contra esta app, servida localmente via `next start`/`nest
 * start` (mesma cadeia de `webServer` do resto da suíte) com `desktopConfig`
 * (spec §"internal tool", não site público — auditar como mobile
 * throttled seria medir o cenário errado). Números reais observados nessa
 * rodada (ver `apps/web/lighthouse-reports/*.html`, gerados localmente, e
 * o relatório desta fase em PROGRESS.md):
 *
 * | rota                              | performance | accessibility | best-practices |
 * |------------------------------------|------------:|---------------:|----------------:|
 * | `/projects` (lista)                 |         100 |            100 |             100 |
 * | `/projects/[id]/code` (Monaco)      |          97 |            100 |             100 |
 * | `/projects/.../runs/[runId]` (timeline) | 100     |            100 |             100 |
 *
 * Os números abaixo NÃO são esses valores exatos — são o piso mais rígido
 * que ainda tolera variância normal de execução local (CPU/IO
 * compartilhados com o resto da máquina; scores de performance do
 * Lighthouse balançam alguns pontos entre rodadas mesmo sem nenhuma
 * mudança de código). Deliberadamente NÃO usamos um piso frouxo (ex.: 50)
 * só porque a rota do Monaco é "pesada por natureza" — servida localmente
 * sem latência de rede real, ela ainda audita 97; um piso de 50 não
 * pegaria uma regressão real de bundle, só uma catástrofe completa. `/code`
 * mantém o piso de performance um pouco mais baixo que as outras duas rotas
 * porque é a única com o bundle do Monaco Editor (`@monaco-editor/react`) —
 * ainda assim perto do observado, não uma desculpa antecipada.
 */
const BUDGETS: Record<'projectsList' | 'codeViewer' | 'runTimeline', Budget> = {
  projectsList: { performance: 90, accessibility: 95, bestPractices: 90 },
  codeViewer: { performance: 85, accessibility: 95, bestPractices: 90 },
  runTimeline: { performance: 90, accessibility: 95, bestPractices: 90 },
};

test.describe('orçamentos de performance/acessibilidade (Lighthouse real)', () => {
  test('audita /projects, /code e a timeline de execução com Lighthouse real contra sessão autenticada de verdade', async ({
    page,
    context,
    baseURL,
  }) => {
    // 3 auditorias Lighthouse reais (cada uma navega, espera a página
    // assentar e roda várias passagens de trace) + navegação de descoberta
    // das rotas dinâmicas — folga generosa sobre o default de 30s.
    test.setTimeout(180_000);

    if (!baseURL) throw new Error('baseURL não configurado em playwright.config.ts');

    // 1) Login real via /login (mesmo padrão de todo o resto da suíte) e
    // navegação real pela UI para descobrir as 3 URLs dinâmicas (os IDs são
    // UUIDs gerados pelo seed — nunca construídos à mão).
    await page.goto('/login');
    await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('/projects');
    const projectsUrl = page.url();

    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    await page.getByRole('link', { name: 'Ver código' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/code$/);
    // O Monaco só monta depois que um arquivo é selecionado na árvore
    // (mesmo fluxo de `code-explorer.spec.ts`) — abre o arquivo real do
    // fixture e espera o editor montar de verdade antes de considerar a
    // rota "pronta para auditar"; medir um estado transitório (bundle
    // ainda carregando) não seria uma auditoria honesta da rota.
    await page.getByRole('button', { name: 'format-currency.ts' }).click();
    await expect(page.getByTestId('code-editor')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('code-editor').locator('.view-lines')).toContainText('formatCurrency', {
      timeout: 15_000,
    });
    const codeViewerUrl = page.url();

    await page.goBack();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await page.getByRole('link', { name: 'Estornos aparecem como cobrança positiva na fatura' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}$/);
    await page.getByRole('link', { name: /Corrigir o bug de formatação de moeda/ }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\/[0-9a-f-]{36}\/runs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Execução de IA' })).toBeVisible();
    const timelineUrl = page.url();

    // 2) Extrai os cookies da sessão real já autenticada.
    const cookies = await context.cookies();

    // 3) Chrome via puppeteer-core, reaproveitando o Chromium que o
    // Playwright já gerencia — sem baixar um segundo navegador.
    const executablePath = playwrightChromium.executablePath();
    const browser = await puppeteer.launch({ executablePath, headless: true });

    try {
      // Precisa navegar para a origem antes de `setCookie` (o cookie de
      // sessão é `httpOnly`/`domain`-scoped ao host real, não a `about:blank`).
      const lhPage = await browser.newPage();
      await lhPage.goto(baseURL);
      await browser.defaultBrowserContext().setCookie(
        ...cookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          ...(cookie.sameSite === 'Lax' || cookie.sameSite === 'Strict' || cookie.sameSite === 'None'
            ? { sameSite: cookie.sameSite }
            : {}),
          ...(cookie.expires > 0 ? { expires: cookie.expires } : {}),
        })),
      );

      await mkdir(REPORTS_DIR, { recursive: true });

      const routes: { slug: string; label: string; url: string; budget: Budget }[] = [
        { slug: 'projects-list', label: '/projects (lista)', url: projectsUrl, budget: BUDGETS.projectsList },
        {
          slug: 'code-viewer',
          label: '/projects/[id]/code (Monaco)',
          url: codeViewerUrl,
          budget: BUDGETS.codeViewer,
        },
        {
          slug: 'run-timeline',
          label: '/projects/[id]/tasks/[taskId]/runs/[runId] (timeline)',
          url: timelineUrl,
          budget: BUDGETS.runTimeline,
        },
      ];

      for (const route of routes) {
        const result = await lighthouse(
          route.url,
          {
            disableStorageReset: true,
            onlyCategories: ['performance', 'accessibility', 'best-practices'],
            output: 'html',
          },
          desktopConfig,
          lhPage,
        );
        if (!result) throw new Error(`Lighthouse não retornou resultado para ${route.label}`);

        const reportHtml = Array.isArray(result.report) ? result.report.join('\n') : result.report;
        await writeFile(path.join(REPORTS_DIR, `${route.slug}.html`), reportHtml, 'utf-8');

        const categories = result.lhr.categories;
        const scores = {
          performance: Math.round((categories.performance?.score ?? 0) * 100),
          accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
          bestPractices: Math.round((categories['best-practices']?.score ?? 0) * 100),
        };

        console.log(
          `[lighthouse] ${route.label}: performance=${scores.performance} accessibility=${scores.accessibility} best-practices=${scores.bestPractices} (relatório: lighthouse-reports/${route.slug}.html)`,
        );

        // `expect.soft` roda as 3 rotas até o fim mesmo se uma categoria
        // violar o orçamento — reporta todas as violações reais de uma vez
        // em vez de abortar na primeira.
        expect.soft(scores.performance, `${route.label}: performance score`).toBeGreaterThanOrEqual(
          route.budget.performance,
        );
        expect.soft(scores.accessibility, `${route.label}: accessibility score`).toBeGreaterThanOrEqual(
          route.budget.accessibility,
        );
        expect
          .soft(scores.bestPractices, `${route.label}: best-practices score`)
          .toBeGreaterThanOrEqual(route.budget.bestPractices);
      }
    } finally {
      await browser.close();
    }
  });
});
