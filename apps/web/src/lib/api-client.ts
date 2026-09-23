/**
 * Erro tipado de chamada de API — carrega o `status` HTTP para quem chama
 * decidir o tratamento (ex.: distinguir 401 de um erro de validação 400).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetch client-side contra `/api/*` — caminho same-origin repassado pelo
 * Next.js (`next.config.ts` `rewrites()`) para a API real, o que faz o
 * cookie httpOnly `forge_session` viajar automaticamente com a
 * requisição (`credentials: 'include'` é redundante para same-origin, mas
 * explícito por clareza).
 *
 * Em 401, redireciona para `/login` — cobre o caso de uma sessão que
 * expirou/foi revogada depois que o `proxy.ts` (checagem só de presença de
 * cookie) já deixou passar a navegação inicial.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      // `apiFetch` é uma função comum (não um componente/hook), chamada de
      // dentro de `queryFn`s do TanStack Query — não tem acesso a
      // `useRouter()`. Um hard navigation também descarta todo o cache do
      // TanStack Query da sessão expirada de propósito, em vez de deixar
      // dados de um usuário desautenticado visíveis até o próximo refetch.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    }
    throw new ApiError('Não autenticado.', 401);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body !== null && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'Ocorreu um erro inesperado.';
    throw new ApiError(message, response.status);
  }

  return body as T;
}
