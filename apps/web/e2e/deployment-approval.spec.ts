import { expect, test } from '@playwright/test';

/**
 * E2E real de ponta a ponta (continuação da Fase 11 — decisão sobre o gate
 * de deploy protegido, spec §13): login como `platform@acme-platform.example`
 * (tem `environment:deploy`) -> solicita deploy em "Staging" (ambiente
 * protegido, evita colidir com `environment-deployments.spec.ts`, que usa
 * "Production") -> gate de aprovação pendente aparece -> troca de sessão
 * para `admin@acme-platform.example` (única role com
 * `environment:approve_deployment` — ver `packages/domain/src/permissions.ts`,
 * `platform_engineer` PODE solicitar mas não decide o próprio pedido) ->
 * aprova (ou rejeita, no segundo teste) -> confirma o resultado refletido
 * na UI via invalidação de query do TanStack Query (decisão deliberada de
 * não usar SSE aqui — ver `project-detail-view.tsx` — mas ainda assim sem
 * `page.reload()`).
 */
/**
 * `apps/web/src/proxy.ts` redireciona `/login` para longe (`pathname ===
 * '/login' && hasSession`) quando já existe um cookie de sessão válido —
 * então trocar de usuário na mesma `page` precisa derrubar a sessão antes
 * de navegar para `/login`, senão `getByLabel('Email')` nunca aparece
 * (`/login` some antes do form renderizar). `clearCookies()` é suficiente
 * aqui porque não há endpoint de logout na UI (`apps/web` não tem um botão
 * "Sair" hoje) — derrubar o cookie `forge_session` é exatamente o que um
 * logout faria.
 */
async function login(page: import('@playwright/test').Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/projects');
}

async function goToStagingRow(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Forge Web App' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.getByRole('listitem').filter({ hasText: 'Staging' });
}

test.describe('decisão de aprovação de deployment protegido (queued -> approve/reject)', () => {
  // `fullyParallel: true` (playwright.config.ts) roda testes do mesmo
  // arquivo em workers distintos por padrão — os dois testes abaixo
  // compartilham o mesmo ambiente "Staging" (só há dois ambientes
  // protegidos no seed demo; "Production" já é usado por
  // `environment-deployments.spec.ts`), então rodar em paralelo faria os
  // dois "Solicitar deploy" concorrentes disputarem qual deployment é o
  // "mais recente" do ambiente. `mode: 'serial'` garante execução em
  // sequência só entre estes dois testes.
  test.describe.configure({ mode: 'serial' });

  test('platform_engineer solicita, admin aprova: status muda para Saudável sem reload', async ({ page }) => {
    test.setTimeout(60_000);

    await login(page, 'platform@acme-platform.example');
    const staging = await goToStagingRow(page);
    await expect(staging.getByText('Protegido')).toBeVisible();
    await staging.getByRole('button', { name: 'Solicitar deploy' }).click();
    await expect(staging.getByText('Aguardando aprovação').first()).toBeVisible();

    // `platform_engineer` só solicita — o backend nega decidir o próprio
    // pedido (`environment:approve_deployment` restrita a `admin`), e a UI
    // nem oferece os botões (mesmo raciocínio de UX de
    // `agent-run-approval.spec.ts`: esconder é UX, o guard real é 403 no
    // backend).
    await expect(staging.getByRole('button', { name: 'Aprovar deploy' })).not.toBeVisible();

    await login(page, 'admin@acme-platform.example');
    const stagingAsAdmin = await goToStagingRow(page);
    await expect(stagingAsAdmin.getByText('Aguardando aprovação').first()).toBeVisible();

    const approveButton = stagingAsAdmin.getByRole('button', { name: 'Aprovar deploy' });
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    // Sem `page.reload()`: a mutação invalida a query de ambientes
    // (`queryKey: ['projects', projectId, 'environments']`) e o refetch
    // automático do TanStack Query atualiza o badge.
    await expect(stagingAsAdmin.getByText('Saudável')).toBeVisible();
    await expect(stagingAsAdmin.getByText('Aguardando aprovação')).not.toBeVisible();
    await expect(approveButton).not.toBeVisible();
  });

  test('platform_engineer solicita, admin rejeita: status muda para Falhou sem reload', async ({ page }) => {
    test.setTimeout(60_000);

    await login(page, 'platform@acme-platform.example');
    const staging = await goToStagingRow(page);
    await staging.getByRole('button', { name: 'Solicitar deploy' }).click();
    await expect(staging.getByText('Aguardando aprovação').first()).toBeVisible();

    await login(page, 'admin@acme-platform.example');
    const stagingAsAdmin = await goToStagingRow(page);
    await expect(stagingAsAdmin.getByText('Aguardando aprovação').first()).toBeVisible();

    const rejectButton = stagingAsAdmin.getByRole('button', { name: 'Rejeitar deploy' });
    await expect(rejectButton).toBeVisible();
    await rejectButton.click();

    await expect(stagingAsAdmin.getByText('Falhou')).toBeVisible();
    await expect(stagingAsAdmin.getByText('Aguardando aprovação')).not.toBeVisible();
    await expect(rejectButton).not.toBeVisible();
  });
});
