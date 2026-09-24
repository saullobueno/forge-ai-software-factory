'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch } from '@/lib/api-client';
import type { ApiAuditLog } from '@/lib/types';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function actorLabel(log: ApiAuditLog): string {
  if (log.actorUser) return `${log.actorUser.name} (${log.actorUser.role})`;
  return log.actorType;
}

export default function AuditLogsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiFetch<ApiAuditLog[]>('/audit-logs'),
  });

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Auditoria' }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="mt-1 text-sm text-muted-foreground">Últimos eventos governados da sua organização.</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando eventos de auditoria…</p>}
      {isError && (
        <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar a auditoria.</p>
      )}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum evento de auditoria registrado.</p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Ação</th>
                <th className="px-3 py-2 font-medium">Ator</th>
                <th className="px-3 py-2 font-medium">Alvo</th>
                <th className="px-3 py-2 font-medium">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge>{log.action}</Badge>
                  </td>
                  <td className="px-3 py-3">{actorLabel(log)}</td>
                  <td className="px-3 py-3">
                    <span className="font-medium">{log.targetType}</span>
                    {log.targetId && (
                      <span className="mt-1 block font-mono text-xs text-muted-foreground">
                        {log.targetId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="min-w-72 px-3 py-3">
                    <pre
                      aria-label={`Metadata do evento ${log.action}`}
                      className="max-h-28 overflow-auto rounded-md bg-muted p-2 text-xs leading-relaxed"
                      tabIndex={0}
                    >
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
