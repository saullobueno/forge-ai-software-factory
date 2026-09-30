'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Logo } from '@/components/logo';
import { NavIcon, type NavIconName } from '@/components/nav-icons';
import { UserMenu } from '@/components/user-menu';
import { apiFetch } from '@/lib/api-client';
import { canApproveAgentRuns } from '@/lib/agent-run-approval-permission';
import { canApproveDeployments } from '@/lib/deployment-approval-permission';
import type { ApiCurrentUser, ApiPendingApproval } from '@/lib/types';

/**
 * Reflete a hierarquia da Arquitetura de Informação (spec §3) sem
 * implementar todas as seções ainda — só algumas entradas são navegáveis
 * nesta fase; o resto aparece esmaecido/não clicável para dar contexto de
 * para onde o produto vai.
 */
const NAV_ITEMS: { label: string; href: string | null; icon: NavIconName }[] = [
  { label: 'Projetos', icon: 'projects', href: '/projects' },
  { label: 'Tarefas', icon: 'tasks', href: '/tasks' },
  { label: 'Execuções de IA', icon: 'runs', href: '/agent-runs' },
  { label: 'Playground IA', icon: 'playground', href: '/ai-playground' },
  { label: 'Uso IA', icon: 'usage', href: '/ai-usage' },
  { label: 'Auditoria', icon: 'audit', href: '/audit-logs' },
  { label: 'Configurações', icon: 'settings', href: null },
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

  // Mesma queryKey (`['auth', 'me']`) já usada por
  // `agent-run-detail-view.tsx` — o TanStack Query dedupe/cacheia entre as
  // duas, então isto não gera uma segunda chamada de rede extra para quem
  // já está numa página que também consulta o próprio usuário.
  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<ApiCurrentUser>('/auth/me'),
  });
  const canSeeApprovals =
    meQuery.data !== undefined && (canApproveAgentRuns(meQuery.data.role) || canApproveDeployments(meQuery.data.role));

  // Contador do menu (Fase 17 continuação #2): só busca quando o usuário
  // já é sabidamente alguém com pelo menos uma permissão de decisão
  // (`enabled: canSeeApprovals`) — nunca dispara `GET /approvals/pending`
  // para quem sempre receberia 403 (ex.: `developer`), o que evitaria só
  // gerar tráfego/retries sem propósito. `staleTime` de 30s: um contador de
  // pendências não precisa estar atualizado ao milissegundo, e isso evita
  // refetch a cada troca de rota dentro do produto (`ProductShell` fica
  // montado o tempo todo, uma navegação client-side não o remonta).
  const pendingApprovalsQuery = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => apiFetch<ApiPendingApproval[]>('/approvals/pending'),
    enabled: canSeeApprovals,
    staleTime: 30_000,
  });
  const pendingApprovalsCount = pendingApprovalsQuery.data?.length ?? 0;

  const navItems = canSeeApprovals
    ? [...NAV_ITEMS.slice(0, 1), { label: 'Aprovações', icon: 'approvals' as const, href: '/approvals' }, ...NAV_ITEMS.slice(1)]
    : NAV_ITEMS;

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
    <div className="flex min-h-screen flex-1 flex-col bg-background text-foreground">
      <a
        href="#conteudo"
        className="sr-only fixed left-3 top-3 z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only"
      >
        Ir para conteúdo
      </a>

      <header className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
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
          <Link href="/projects" aria-label="forge — início">
            <Logo />
          </Link>
        </div>
        <UserMenu user={meQuery.data} />
      </header>
      <div className="flex min-h-0 flex-1">
        {mobileNavOpen && (
          <div
            aria-hidden
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
          />
        )}

        <aside
          id="navegacao-mobile"
          className={`${mobileNavOpen ? 'fixed inset-y-0 left-0 z-40 flex w-64 pt-16' : 'hidden'} flex-col border-r border-border bg-background px-4 py-4 md:static md:z-auto md:flex md:w-56 md:shrink-0 md:pt-4`}
        >
          <nav aria-label="navegação principal" className="flex flex-col gap-1">
            {navItems.map((item, index) =>
              item.href ? (
                <Link
                  key={item.label}
                  ref={index === 0 ? firstNavLinkRef : undefined}
                  href={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <NavIcon name={item.icon} />
                  <span className="flex-1">{item.label}</span>
                  {item.label === 'Aprovações' && pendingApprovalsCount > 0 && (
                    <span
                      aria-label={`${pendingApprovalsCount} aprovações pendentes`}
                      className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground"
                    >
                      {pendingApprovalsCount}
                    </span>
                  )}
                </Link>
              ) : (
                <span
                  key={item.label}
                  aria-disabled
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/60"
                  title="Ainda não implementado"
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </span>
              ),
            )}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none md:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
