'use client';

import { useEffect, useRef, useState } from 'react';
import { ThemeMenuItem } from '@/components/theme-toggle';
import { apiFetch } from '@/lib/api-client';
import type { ApiCurrentUser } from '@/lib/types';

const ROLE_LABELS: Record<ApiCurrentUser['role'], string> = {
  admin: 'Administrador',
  platform_engineer: 'Engenheiro de plataforma',
  tech_lead: 'Tech lead',
  developer: 'Desenvolvedor',
  qa_engineer: 'QA',
  product_manager: 'Product manager',
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function UserMenu({ user }: { user: ApiCurrentUser | undefined }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (user === undefined) {
    return <span aria-hidden className="size-9 animate-pulse rounded-full bg-muted" />;
  }

  const signOut = async () => {
    setSigningOut(true);
    let destination = '/login';
    try {
      await apiFetch<null>('/auth/logout', { method: 'POST' });
    } catch {
      // Se o logout falhar, `expired=1` faz o proxy descartar o cookie de qualquer forma.
      destination = '/login?expired=1';
    }
    // Navegação completa de propósito: descarta todo o cache do TanStack Query da sessão encerrada.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = destination;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu do usuário ${user.name}`}
        data-testid="user-menu-trigger"
        className="flex items-center gap-2 rounded-md border border-border py-1 pl-1 pr-2 text-sm transition-colors hover:bg-muted"
      >
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initialsOf(user.name)}
        </span>
        <span className="hidden max-w-40 truncate font-medium sm:block">{user.name}</span>
        <svg aria-hidden viewBox="0 0 16 16" className="size-3 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menu do usuário"
          data-testid="user-menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border bg-background p-1 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <p className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </p>
          </div>
          <div role="separator" className="my-1 h-px bg-border" />
          <ThemeMenuItem />
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      )}
    </div>
  );
}
