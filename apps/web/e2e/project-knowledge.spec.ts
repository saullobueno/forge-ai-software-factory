import { expect, test } from '@playwright/test';

test.describe('conhecimento do projeto', () => {
  test('tech lead vê fontes indexadas e busca trechos de contexto', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/projects');
    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    // As fontes vêm do indexador real (Fase 12 continuação): arquivos de
    // verdade do repositório demo (`fixtures/acme-platform-web/`) e
    // documentos reais do próprio Forge (`docs/threat-model.md`), nunca
    // texto hardcoded no seed.
    await expect(page.getByRole('heading', { name: 'Conhecimento' })).toBeVisible();
    await expect(page.getByText('src/lib/format-currency.ts').first()).toBeVisible();
    await expect(page.getByText('docs/threat-model.md').first()).toBeVisible();
    await expect(page.getByText('score 1').first()).toBeVisible();

    // "estornos" só aparece de verdade no README real do fixture
    // (`fixtures/acme-platform-web/README.md`) — termo real do arquivo, não
    // escolhido arbitrariamente.
    await page.getByLabel('Buscar conhecimento').fill('estornos');
    await page.getByRole('button', { name: 'Buscar' }).click();

    await expect(page.getByText('README.md').first()).toBeVisible();
    await expect(page.getByText(/estornos/).first()).toBeVisible();
  });

  test('tech lead reindexa o conhecimento sob demanda e vê o resultado real', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('tech-lead@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/projects');
    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    // O seed real já indexou este projeto (Fase 12 continuação) com o
    // MESMO indexador/parâmetros que o reindex sob demanda usa — a primeira
    // chamada real de reindex contra o banco recém-seedado precisa
    // reconhecer que nenhum arquivo mudou (staleness real por hash), não
    // criar/atualizar nada.
    await page.getByRole('button', { name: 'Reindexar' }).click();

    const result = page.getByTestId('knowledge-reindex-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('0 nova(s)');
    await expect(result).toContainText('0 atualizada(s)');
    await expect(result).toContainText('já em dia');
  });

  test('developer não vê o botão Reindexar (sem project:write)', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('dev@acme-platform.example');
    await page.getByLabel('Senha').fill('demo1234');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL('/projects');
    await page.getByRole('link', { name: 'Forge Web App' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    await expect(page.getByRole('heading', { name: 'Conhecimento' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reindexar' })).toHaveCount(0);
  });
});
