'use client';

import Link from 'next/link';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { useNotifications } from '@/components/notification-bell';

const KIND_LABELS: Record<string, string> = {
  task_assigned: 'Tarefa',
  approval_requested: 'Aprovação',
  agent_run_completed: 'Execução',
  agent_run_failed: 'Execução',
};

export default function NotificationsPage() {
  const { items, unreadCount, isLoading, isError, markRead, markAllRead } = useNotifications();

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Notificações' }]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tarefas atribuídas a você, aprovações pendentes e o desfecho das suas execuções de IA.
          </p>
        </div>
        <button
          type="button"
          onClick={() => markAllRead.mutate()}
          disabled={unreadCount === 0 || markAllRead.isPending}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          Marcar todas como lidas
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando notificações…</p>}
      {isError && <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar as notificações.</p>}
      {!isLoading && items.length === 0 && <p className="text-sm text-muted-foreground">Você não tem notificações.</p>}

      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border" data-testid="notifications-list">
          {items.map((item) => (
            <li key={item.id} data-testid="notification-item" className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  {item.link ? (
                    <Link
                      href={item.link}
                      onClick={() => !item.isRead && markRead.mutate(item.id)}
                      className={`text-sm hover:underline ${item.isRead ? 'text-muted-foreground' : 'font-medium'}`}
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <span className={`text-sm ${item.isRead ? 'text-muted-foreground' : 'font-medium'}`}>{item.title}</span>
                  )}
                  <Badge>{KIND_LABELS[item.kind] ?? item.kind}</Badge>
                  {!item.isRead && <Badge tone="positive">Nova</Badge>}
                </span>
                {item.body && <span className="text-xs text-muted-foreground">{item.body}</span>}
                <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('pt-BR')}</span>
              </div>
              {!item.isRead && (
                <button
                  type="button"
                  onClick={() => markRead.mutate(item.id)}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  Marcar como lida
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
