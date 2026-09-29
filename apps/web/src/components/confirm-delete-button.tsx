'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api-client';

/**
 * Exclusão em duas etapas: o primeiro clique só pede confirmação, o segundo
 * executa. `onDelete` deve lançar em caso de falha (ex.: 409 por execução de
 * IA em andamento) — a mensagem da API é exibida abaixo do botão.
 */
export function ConfirmDeleteButton({
  label,
  description,
  onDelete,
  testId,
}: {
  label: string;
  description: string;
  onDelete: () => Promise<unknown>;
  testId?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      await onDelete();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir.');
      setConfirming(false);
      setPending(false);
    }
  };

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          data-testid={testId}
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-md border border-red-600/40 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-muted dark:border-red-400/40 dark:text-red-400"
        >
          {label}
        </button>
        {error && (
          <p role="alert" className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div role="alertdialog" aria-label={label} className="flex max-w-xs flex-col items-end gap-2 rounded-md border border-red-600/40 p-3 dark:border-red-400/40">
      <p className="text-right text-xs text-muted-foreground">{description}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void run()}
          disabled={pending}
          className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Excluindo…' : 'Confirmar exclusão'}
        </button>
      </div>
    </div>
  );
}
