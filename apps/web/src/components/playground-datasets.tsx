'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AIPlaygroundDatasetItem,
  PlaygroundDatasetDetail,
  PlaygroundDatasetSummary,
  PlaygroundDatasetVersionDetail,
} from '@forge/types';
import { apiFetch, ApiError } from '@/lib/api-client';

const INPUT_CLASS = 'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
const BUTTON_CLASS = 'rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

export interface LoadedDatasetVersion {
  datasetId: string;
  versionId: string;
  version: number;
  name: string;
  /** Texto exato carregado — enquanto o editor não muda, a avaliação usa o id da versão. */
  text: string;
}

const errorMessage = (error: unknown): string => (error instanceof ApiError ? error.message : 'Não foi possível concluir a ação.');

/**
 * Datasets salvos do Playground com histórico: carregar uma versão, salvar o
 * que está no editor como novo dataset ou como nova versão (as anteriores
 * nunca mudam).
 */
export function PlaygroundDatasets({
  editorText,
  parseEditor,
  loaded,
  onLoad,
}: {
  editorText: string;
  /** Converte o texto do editor em casos; lança se inválido. */
  parseEditor: (text: string) => AIPlaygroundDatasetItem[];
  loaded: LoadedDatasetVersion | null;
  onLoad: (items: AIPlaygroundDatasetItem[], meta: Omit<LoadedDatasetVersion, 'text'>) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [selectedVersion, setSelectedVersion] = useState('');
  const [newName, setNewName] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const list = useQuery({
    queryKey: ['playground-datasets'],
    queryFn: () => apiFetch<PlaygroundDatasetSummary[]>('/ai-playground/datasets'),
  });
  const detail = useQuery({
    queryKey: ['playground-datasets', selectedId],
    enabled: selectedId !== '',
    queryFn: () => apiFetch<PlaygroundDatasetDetail>(`/ai-playground/datasets/${selectedId}`),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['playground-datasets'] });
  const fail = (error: unknown) => setMessage({ tone: 'error', text: errorMessage(error) });

  const load = useMutation({
    mutationFn: async () => {
      const version = Number(selectedVersion || detail.data?.versions[0]?.version);
      return apiFetch<PlaygroundDatasetVersionDetail>(`/ai-playground/datasets/${selectedId}/versions/${version}`);
    },
    onSuccess: (version) => {
      onLoad(version.items, {
        datasetId: version.datasetId,
        versionId: version.id,
        version: version.version,
        name: detail.data?.name ?? '',
      });
      setMessage({ tone: 'ok', text: `Versão ${version.version} carregada no editor.` });
    },
    onError: fail,
  });

  const saveNew = useMutation({
    mutationFn: () => apiFetch<PlaygroundDatasetDetail>('/ai-playground/datasets', { method: 'POST', body: JSON.stringify({ name: newName, items: parseEditor(editorText) }) }),
    onSuccess: (created) => {
      setNewName('');
      setSelectedId(created.id);
      setSelectedVersion('');
      setMessage({ tone: 'ok', text: `Dataset "${created.name}" salvo (v1).` });
      refresh();
    },
    onError: (error) => setMessage({ tone: 'error', text: error instanceof SyntaxError || error instanceof Error ? error.message : errorMessage(error) }),
  });

  const saveVersion = useMutation({
    mutationFn: () =>
      apiFetch<PlaygroundDatasetVersionDetail>(`/ai-playground/datasets/${selectedId}/versions`, {
        method: 'POST',
        body: JSON.stringify({ items: parseEditor(editorText), ...(note.trim() ? { note } : {}) }),
      }),
    onSuccess: (version) => {
      setNote('');
      setSelectedVersion('');
      setMessage({ tone: 'ok', text: `Nova versão ${version.version} salva.` });
      refresh();
    },
    onError: (error) => setMessage({ tone: 'error', text: error instanceof Error && !(error instanceof ApiError) ? error.message : errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch<null>(`/ai-playground/datasets/${selectedId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setSelectedId('');
      setMessage({ tone: 'ok', text: 'Dataset removido.' });
      refresh();
    },
    onError: fail,
  });

  return (
    <section aria-labelledby="datasets-heading" className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid="playground-datasets">
      <h2 id="datasets-heading" className="text-sm font-medium">
        Datasets salvos
      </h2>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Dataset
          <select
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setSelectedVersion('');
            }}
            className={INPUT_CLASS}
          >
            <option value="">Selecione…</option>
            {(list.data ?? []).map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name} (v{dataset.latestVersion.version})
              </option>
            ))}
          </select>
        </label>

        {detail.data && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Versão
            <select value={selectedVersion} onChange={(event) => setSelectedVersion(event.target.value)} className={INPUT_CLASS}>
              {detail.data.versions.map((version) => (
                <option key={version.id} value={String(version.version)}>
                  v{version.version} — {version.itemsCount} caso(s){version.note ? ` — ${version.note}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <button type="button" onClick={() => load.mutate()} disabled={selectedId === '' || !detail.data || load.isPending} className={BUTTON_CLASS}>
          Carregar no editor
        </button>
        <button type="button" onClick={() => remove.mutate()} disabled={selectedId === '' || remove.isPending} className={BUTTON_CLASS}>
          Remover
        </button>
      </div>

      {loaded && (
        <p className="text-xs text-muted-foreground" data-testid="loaded-dataset">
          Carregado: <strong className="text-foreground">{loaded.name}</strong> v{loaded.version}
          {editorText === loaded.text ? ' — a avaliação usa esta versão salva.' : ' — editor modificado (a avaliação usará os casos do editor).'}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Salvar o editor como novo dataset
          <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={120} placeholder="Nome do dataset" className={INPUT_CLASS} />
        </label>
        <button type="button" onClick={() => saveNew.mutate()} disabled={newName.trim() === '' || saveNew.isPending} className={BUTTON_CLASS}>
          Salvar dataset
        </button>
      </div>

      {selectedId !== '' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Nota da nova versão (opcional)
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} className={INPUT_CLASS} />
          </label>
          <button type="button" onClick={() => saveVersion.mutate()} disabled={saveVersion.isPending} className={BUTTON_CLASS}>
            Salvar como nova versão
          </button>
        </div>
      )}

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${message.tone === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
