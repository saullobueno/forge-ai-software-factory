'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ApiCurrentUser, ApiTaskComment } from '@/lib/types';

function canDeleteAny(role: ApiCurrentUser['role']): boolean {
  return role === 'admin' || role === 'tech_lead';
}

export function TaskComments({
  taskId,
  currentUser,
  disabled,
}: {
  taskId: string;
  currentUser: ApiCurrentUser | undefined;
  /** projeto de demonstração: comentários desligados */
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const commentsQuery = useQuery({
    queryKey: ['tasks', taskId, 'comments'],
    queryFn: () => apiFetch<ApiTaskComment[]>(`/tasks/${taskId}/comments`),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'comments'] });
    void queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'activity'] });
  };

  const addComment = useMutation({
    mutationFn: () => apiFetch<ApiTaskComment[]>(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setBody('');
      refresh();
    },
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: string) => apiFetch<null>(`/tasks/${taskId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (body.trim()) addComment.mutate();
  };

  const comments = commentsQuery.data ?? [];
  const error = addComment.error ?? deleteComment.error;

  return (
    <section className="rounded-lg border border-border p-4" data-testid="task-comments">
      <h2 className="text-sm font-medium">Comentários</h2>

      {commentsQuery.isLoading && <p className="mt-2 text-sm text-muted-foreground">Carregando comentários…</p>}
      {commentsQuery.data && comments.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">Nenhum comentário ainda.</p>
      )}

      {comments.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {comments.map((comment) => {
            const mayDelete =
              currentUser !== undefined &&
              (comment.authorUserId === currentUser.id || canDeleteAny(currentUser.role));
            return (
              <li key={comment.id} className="rounded-md border border-border p-3" data-testid="task-comment">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">{comment.authorName ?? 'Usuário removido'}</span> ·{' '}
                    {new Date(comment.createdAt).toLocaleString('pt-BR')}
                  </span>
                  {mayDelete && (
                    <button
                      type="button"
                      onClick={() => deleteComment.mutate(comment.id)}
                      disabled={deleteComment.isPending}
                      aria-label="Apagar comentário"
                      className="rounded-md border border-border px-2 py-0.5 hover:bg-muted disabled:opacity-60"
                    >
                      Apagar
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {disabled ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Comentários estão desativados nas tarefas do projeto de demonstração.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2" aria-label="Novo comentário">
          <label htmlFor="new-comment" className="text-xs font-medium text-muted-foreground">
            Escreva um comentário
          </label>
          <textarea
            id="new-comment"
            rows={3}
            maxLength={4000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={addComment.isPending || body.trim().length === 0}
            className="self-start rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {addComment.isPending ? 'Enviando…' : 'Comentar'}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error instanceof ApiError ? error.message : 'Não foi possível concluir a ação.'}
        </p>
      )}
    </section>
  );
}
