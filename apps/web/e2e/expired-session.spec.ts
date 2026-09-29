import { expect, test } from '@playwright/test';

test('cookie de sessão rejeitado pela API (JWT vencido) cai no login em vez de entrar em loop', async ({ page, context, baseURL }) => {
  await context.addCookies([
    { name: 'forge_session', value: 'jwt-invalido-ou-vencido', url: baseURL ?? 'http://127.0.0.1:3100', httpOnly: true, sameSite: 'Lax' },
  ]);

  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });

  await page.goto('/projects');

  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await page.waitForTimeout(3000);
  expect(navigations).toBeLessThan(6);
  await expect(page).toHaveURL(/\/login/);

  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === 'forge_session')).toBeUndefined();
});
