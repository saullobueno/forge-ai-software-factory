'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * Evita mismatch de hidratação sem cair no anti-padrão de setState dentro de
 * useEffect: no servidor `getServerSnapshot` sempre retorna false, no
 * cliente `getSnapshot` retorna true assim que o React reconcilia.
 */
function useHasMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Alterna explicitamente entre "light" e "dark" (não usa "system") para que
 * o estado do botão seja sempre determinístico e fácil de testar via E2E.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();

  if (!mounted) {
    return <button aria-hidden className="size-9 rounded-md border border-border" />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      data-testid="theme-toggle"
      className="flex size-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
    >
      <span aria-hidden className="text-base">
        {isDark ? '☀️' : '🌙'}
      </span>
    </button>
  );
}

/** Versão para dentro de menus: item de texto com o mesmo comportamento do `ThemeToggle`. */
export function ThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();

  if (!mounted) return null;

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      data-testid="theme-menu-item"
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
    >
      <span aria-hidden>{isDark ? '☀️' : '🌙'}</span>
      {isDark ? 'Tema claro' : 'Tema escuro'}
    </button>
  );
}
