import { expect, test } from '@playwright/test';

test.describe('alternância de tema', () => {
  test('alterna entre claro e escuro e persiste após reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    const html = page.locator('html');
    const toggle = page.getByTestId('theme-toggle');

    await expect(html).not.toHaveClass(/dark/);

    await toggle.click();
    await expect(html).toHaveClass(/dark/);
    await expect(toggle).toHaveAttribute('aria-label', 'Ativar tema claro');

    await page.reload();
    await expect(html).toHaveClass(/dark/);

    await toggle.click();
    await expect(html).not.toHaveClass(/dark/);
  });
});
