'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Instância de `QueryClient` por sessão do browser (`useState` em vez de
 * módulo top-level) — evita compartilhar cache entre requisições/usuários
 * no lado servidor e garante uma única instância estável entre re-renders
 * no cliente.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
