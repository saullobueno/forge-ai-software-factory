'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Reflete a hierarquia da Arquitetura de Informação (spec §3) sem
 * implementar todas as seções ainda — só algumas entradas são navegáveis
 * nesta fase; o resto aparece esmaecido/não clicável para dar contexto de
 * para onde o produto vai.
 */
const NAV_ITEMS: { label: string; href: string | null }[] = [
  { label: 'Projetos', href: '/projects' },
  { label: 'Tarefas', href: null },
  { label: 'Execuções de IA', href: null },
  { label: 'Playground IA', href: '/ai-playground' },
  { label: 'Auditoria', href: '/audit-logs' },
  { label: 'Configurações', href: null },
];

/**
 * Fase 15 (performance/acessibilidade): a sidebar original era `w-56
 * shrink-0` sem tratamento responsivo, o que espremia o conteúdo em
 * viewports estreitos. A correção fica concentrada neste Client Component
 * pequeno para preservar o `layout.tsx` como Server Component.
 *
 * É sempre o mesmo `<aside>/<nav>` no DOM: abaixo de `md`, ele nasce
 * escondido e vira drawer fixo só quando `mobileNavOpen`; a partir de `md`,
 * as classes `md:*` sempre vencem e o estado mobile não afeta o desktop.
 */
export function ProductShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const firstNavLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!mobileNavOpen) return;

    firstNavLinkRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
        toggleButtonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-screen flex-1 bg-background text-foreground">
      <a
        href="#conteudo"
        className="sr-only fixed left-3 top-3 z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only"
      >
        Ir para conteúdo
      </a>

      {mobileNavOpen && (
        <div
          aria-hidden
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        id="navegacao-mobile"
        className={`${mobileNavOpen ? 'fixed inset-y-0 left-0 z-40 flex w-64' : 'hidden'} flex-col border-r border-border bg-background px-4 py-4 md:static md:z-auto md:flex md:w-56 md:shrink-0`}
      >
        <span className="px-2 font-mono text-sm font-semibold tracking-tight">forge</span>
        <nav aria-label="navegação principal" className="mt-6 flex flex-col gap-1">
          {NAV_ITEMS.map((item, index) =>
            item.href ? (
              <Link
                key={item.label}
                ref={index === 0 ? firstNavLinkRef : undefined}
                href={item.href}
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                aria-disabled
                className="cursor-default rounded-md px-2 py-1.5 text-sm text-muted-foreground/60"
                title="Ainda não implementado"
              >
                {item.label}
              </span>
            ),
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 md:justify-end md:px-6">
          <button
            ref={toggleButtonRef}
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            aria-controls="navegacao-mobile"
            aria-label={mobileNavOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
            className="flex size-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted md:hidden"
          >
            <span aria-hidden className="relative block size-4">
              <span
                className={`absolute left-0 top-1/2 h-0.5 w-4 bg-current transition-transform ${mobileNavOpen ? 'translate-y-0 rotate-45' : '-translate-y-1.5'}`}
              />
              <span
                className={`absolute left-0 top-1/2 h-0.5 w-4 bg-current transition-opacity ${mobileNavOpen ? 'opacity-0' : 'opacity-100'}`}
              />
              <span
                className={`absolute left-0 top-1/2 h-0.5 w-4 bg-current transition-transform ${mobileNavOpen ? 'translate-y-0 -rotate-45' : 'translate-y-1.5'}`}
              />
            </span>
          </button>
          <ThemeToggle />
        </header>
        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
