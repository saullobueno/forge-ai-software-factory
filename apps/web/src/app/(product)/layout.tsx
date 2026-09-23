import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Reflete a hierarquia da Arquitetura de Informação (spec §3) sem
 * implementar todas as seções ainda — só "Projetos" é navegável nesta
 * fase; o resto aparece esmaecido/não clicável para dar contexto de para
 * onde o produto vai (spec §4: "sidebar recolhível... inspirado em
 * GitHub, Linear, Vercel").
 */
const NAV_ITEMS: { label: string; href: string | null }[] = [
  { label: 'Projetos', href: '/projects' },
  { label: 'Tarefas', href: null },
  { label: 'Execuções de IA', href: null },
  { label: 'Configurações', href: null },
];

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border px-4 py-4">
        <span className="px-2 font-mono text-sm font-semibold tracking-tight">forge</span>
        <nav aria-label="navegação principal" className="mt-6 flex flex-col gap-1">
          {NAV_ITEMS.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
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

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-border px-6 py-3">
          <ThemeToggle />
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
