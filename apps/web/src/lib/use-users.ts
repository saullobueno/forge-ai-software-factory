import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ApiUser } from '@/lib/types';

/** Membros da organização, com um mapa id -> nome para exibir responsáveis. */
export function useUsers() {
  const query = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<ApiUser[]>('/users'),
    staleTime: 60_000,
  });
  const nameById = new Map((query.data ?? []).map((user) => [user.id, user.name]));
  return { users: query.data ?? [], nameById, isLoading: query.isLoading };
}

export function splitLabels(value: string): string[] {
  return value
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
}
