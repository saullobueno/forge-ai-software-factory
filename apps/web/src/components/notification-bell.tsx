'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import type { ApiNotifications } from '@/lib/types';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

/** Lista de notificações + ações de leitura, compartilhada entre o sino e a página `/notifications`. */
export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => apiFetch<ApiNotifications>('/notifications'),
    refetchInterval: 30_000,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: () => apiFetch<null>('/notifications/read-all', { method: 'POST' }),
    onSuccess: refresh,
  });

  return { ...query, items: query.data?.items ?? [], unreadCount: query.data?.unreadCount ?? 0, markRead, markAllRead };
}

function BellIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openItem = (id: string, link: string | null, isRead: boolean) => {
    if (!isRead) markRead.mutate(id);
    setOpen(false);
    if (link) router.push(link);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : 'Notificações'}
        data-testid="notification-bell"
        className="relative flex size-9 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span
            aria-hidden
            data-testid="notification-badge"
            className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificações"
          data-testid="notification-panel"
          className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-border bg-background shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-sm font-medium">Notificações</h2>
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={unreadCount === 0 || markAllRead.isPending}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
            >
              Marcar todas como lidas
            </button>
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Você não tem notificações.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.slice(0, 8).map((item) => (
                <li key={item.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => openItem(item.id, item.link, item.isRead)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className={`text-sm ${item.isRead ? 'text-muted-foreground' : 'font-medium'}`}>
                      {!item.isRead && <span aria-label="não lida" className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" />}
                      {item.title}
                    </span>
                    {item.body && <span className="text-xs text-muted-foreground">{item.body}</span>}
                    <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border px-3 py-2">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-medium hover:underline">
              Ver todas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
