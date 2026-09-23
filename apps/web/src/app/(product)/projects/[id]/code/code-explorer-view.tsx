'use client';

import { useQuery } from '@tanstack/react-query';
import type { OnMount } from '@monaco-editor/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Badge } from '@/components/badge';
import { Breadcrumb } from '@/components/breadcrumb';
import { apiFetch } from '@/lib/api-client';
import { reconstructOriginalFromPatch } from '@/lib/reconstruct-diff-original';
import type {
  ApiCodeSymbol,
  ApiDiffEntry,
  ApiFileContent,
  ApiProject,
  ApiSearchResult,
  ApiTreeNode,
} from '@/lib/types';
import { FileTree } from './file-tree';

// `ssr: false`: monaco-editor toca `window`/`self` no load — nunca deve
// rodar no servidor. O visualizador é sempre somente leitura (`readOnly`):
// Fase 5 é "árvore, busca, viewer/editor, diff, contexto de arquitetura"
// (spec §10) — não existe (e não deveria existir aqui) nenhum caminho de
// gravação; isso é Fase 7/8, quando agentes aplicam patches de verdade via
// runner.
const MonacoEditor = dynamic(() => import('@monaco-editor/react').then((mod) => mod.Editor), { ssr: false });
const MonacoDiffEditor = dynamic(() => import('@monaco-editor/react').then((mod) => mod.DiffEditor), { ssr: false });

type Tab = 'file' | 'diff';

const SYMBOL_KIND_LABELS: Record<ApiCodeSymbol['kind'], string> = {
  function: 'função',
  class: 'classe',
  interface: 'interface',
  type: 'tipo',
  enum: 'enum',
  variable: 'variável',
  're-export': 're-export',
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  created: 'Criado',
  modified: 'Modificado',
  deleted: 'Removido',
  renamed: 'Renomeado',
};

function languageFromPath(path: string): string {
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex === -1) return 'plaintext';
  const extension = path.slice(dotIndex).toLowerCase();
  if (extension === '.ts' || extension === '.tsx') return 'typescript';
  if (extension === '.js' || extension === '.jsx') return 'javascript';
  if (extension === '.json') return 'json';
  if (extension === '.md') return 'markdown';
  return 'plaintext';
}

export function CodeExplorerView({ projectId }: { projectId: string }) {
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('file');
  const [selectedDiffId, setSelectedDiffId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => apiFetch<ApiProject>(`/projects/${projectId}`),
  });

  const treeQuery = useQuery({
    queryKey: ['projects', projectId, 'repository', 'tree'],
    queryFn: () => apiFetch<ApiTreeNode[]>(`/projects/${projectId}/repository/tree`),
  });

  const fileQuery = useQuery({
    queryKey: ['projects', projectId, 'repository', 'file', selectedPath],
    queryFn: () =>
      apiFetch<ApiFileContent>(`/projects/${projectId}/repository/file?path=${encodeURIComponent(selectedPath ?? '')}`),
    enabled: selectedPath !== null,
  });

  const searchQuery = useQuery({
    queryKey: ['projects', projectId, 'repository', 'search', submittedQuery],
    queryFn: () =>
      apiFetch<ApiSearchResult[]>(`/projects/${projectId}/repository/search?q=${encodeURIComponent(submittedQuery)}`),
    enabled: submittedQuery.length > 0,
  });

  const diffQuery = useQuery({
    queryKey: ['projects', projectId, 'repository', 'diff'],
    queryFn: () => apiFetch<ApiDiffEntry[]>(`/projects/${projectId}/repository/diff`),
  });

  const diffs = diffQuery.data ?? [];
  const selectedDiff = diffs.find((entry) => entry.id === selectedDiffId) ?? diffs[0] ?? null;

  // O `DiffEditor` do Monaco precisa dos dois textos completos, não de um
  // patch — busca o conteúdo "depois" (atual) do arquivo do diff
  // selecionado pra reconstruir o "antes" a partir do patch (ver
  // `reconstruct-diff-original.ts`). Não se aplica a arquivos removidos
  // (não há conteúdo atual pra buscar); esse caso cai no fallback de patch
  // bruto abaixo.
  const diffModifiedQuery = useQuery({
    queryKey: ['projects', projectId, 'repository', 'file', selectedDiff?.filePath, 'diff-modified-side'],
    queryFn: () =>
      apiFetch<ApiFileContent>(
        `/projects/${projectId}/repository/file?path=${encodeURIComponent(selectedDiff?.filePath ?? '')}`,
      ),
    enabled: tab === 'diff' && selectedDiff !== null && selectedDiff.changeType !== 'deleted',
  });

  const diffTexts = useMemo(() => {
    if (!selectedDiff || !diffModifiedQuery.data) return null;
    const original = reconstructOriginalFromPatch(diffModifiedQuery.data.content, selectedDiff.patch);
    return original !== null ? { original, modified: diffModifiedQuery.data.content } : null;
  }, [selectedDiff, diffModifiedQuery.data]);

  function handleSelectFile(path: string) {
    setSelectedPath(path);
    setTab('file');
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmittedQuery(searchInput.trim());
  }

  function handleOpenSearchResult(path: string) {
    handleSelectFile(path);
  }

  function handleSymbolClick(line: number) {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;
    editorInstance.revealLineInCenter(line);
    editorInstance.setPosition({ lineNumber: line, column: 1 });
    editorInstance.focus();
  }

  if (projectQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando projeto…</p>;
  }

  if (projectQuery.isError || !projectQuery.data) {
    return <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar este projeto.</p>;
  }

  const project = projectQuery.data;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: 'Projetos', href: '/projects' },
          { label: project.name, href: `/projects/${projectId}` },
          { label: 'Código' },
        ]}
      />

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Código — {project.name}</h1>
        <Link href={`/projects/${projectId}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          Ver detalhes do projeto
        </Link>
      </div>

      {(project.architectureNotes || project.codeRules) && (
        <section className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">Contexto de arquitetura</h2>
            <Link href={`/projects/${projectId}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              ver completo
            </Link>
          </div>
          {project.architectureNotes && (
            <p className="mt-1.5 line-clamp-2 text-muted-foreground">{project.architectureNotes}</p>
          )}
          {project.codeRules && <p className="mt-1.5 line-clamp-2 text-muted-foreground">{project.codeRules}</p>}
        </section>
      )}

      {treeQuery.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Não foi possível carregar o repositório deste projeto.
        </p>
      )}

      {treeQuery.data && (
        <div className="grid grid-cols-[240px_1fr] gap-4">
          <aside className="flex flex-col gap-3">
            <form onSubmit={handleSearchSubmit} className="flex flex-col gap-1.5">
              <label htmlFor="code-search" className="text-xs font-medium text-muted-foreground">
                Buscar no repositório
              </label>
              <div className="flex gap-1.5">
                <input
                  id="code-search"
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="nome de arquivo ou conteúdo…"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
                >
                  Buscar
                </button>
              </div>
            </form>

            {submittedQuery.length > 0 && (
              <div className="rounded-md border border-border p-2">
                <p className="text-xs font-medium text-muted-foreground">Resultados para &quot;{submittedQuery}&quot;</p>
                {searchQuery.isLoading && <p className="mt-1 text-xs text-muted-foreground">Buscando…</p>}
                {searchQuery.data && searchQuery.data.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Nenhum resultado.</p>
                )}
                {searchQuery.data && searchQuery.data.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-1" data-testid="search-results">
                    {searchQuery.data.map((result) => (
                      <li key={result.path}>
                        <button
                          type="button"
                          onClick={() => handleOpenSearchResult(result.path)}
                          className="w-full rounded px-1.5 py-1 text-left text-xs text-foreground hover:bg-muted"
                        >
                          <span className="block truncate font-mono">{result.path}</span>
                          {result.snippet && (
                            <span className="block truncate text-muted-foreground">{result.snippet}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border p-2">
              <FileTree nodes={treeQuery.data} selectedPath={selectedPath} onSelectFile={handleSelectFile} />
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex gap-1 border-b border-border">
              <button
                type="button"
                onClick={() => setTab('file')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  tab === 'file' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Arquivo
              </button>
              <button
                type="button"
                onClick={() => setTab('diff')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  tab === 'diff' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Diff
                {diffs.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({diffs.length})</span>}
              </button>
            </div>

            {tab === 'file' && (
              <div className="grid grid-cols-[1fr_200px] gap-3">
                <div className="flex min-w-0 flex-col gap-2">
                  {!selectedPath && (
                    <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Selecione um arquivo na árvore ao lado.
                    </p>
                  )}
                  {selectedPath && fileQuery.isLoading && (
                    <p className="text-sm text-muted-foreground">Carregando arquivo…</p>
                  )}
                  {selectedPath && fileQuery.isError && (
                    <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar este arquivo.</p>
                  )}
                  {selectedPath && fileQuery.data && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-muted-foreground">{fileQuery.data.path}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{fileQuery.data.sizeBytes} bytes</span>
                      </div>
                      <div className="overflow-hidden rounded-md border border-border" data-testid="code-editor">
                        <MonacoEditor
                          height="480px"
                          language={fileQuery.data.language}
                          value={fileQuery.data.content}
                          theme={monacoTheme}
                          path={fileQuery.data.path}
                          onMount={(editorInstance) => {
                            editorRef.current = editorInstance;
                          }}
                          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
                        />
                      </div>
                    </>
                  )}
                </div>

                <aside className="flex flex-col gap-1.5">
                  <h2 className="text-xs font-medium text-muted-foreground">Símbolos</h2>
                  {!fileQuery.data && <p className="text-xs text-muted-foreground">—</p>}
                  {fileQuery.data && fileQuery.data.symbols === null && (
                    <p className="text-xs text-muted-foreground">Sem extração de símbolos para este tipo de arquivo.</p>
                  )}
                  {fileQuery.data && fileQuery.data.symbols !== null && fileQuery.data.symbols.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum símbolo exportado encontrado.</p>
                  )}
                  {fileQuery.data && fileQuery.data.symbols && fileQuery.data.symbols.length > 0 && (
                    <ul className="flex flex-col gap-1" data-testid="symbol-list">
                      {fileQuery.data.symbols.map((symbol) => (
                        <li key={`${symbol.kind}-${symbol.name}-${symbol.line}`}>
                          <button
                            type="button"
                            onClick={() => handleSymbolClick(symbol.line)}
                            className="flex w-full items-center justify-between gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
                          >
                            <span className="truncate font-mono text-foreground">{symbol.name}</span>
                            <Badge tone="neutral">{SYMBOL_KIND_LABELS[symbol.kind]}</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </aside>
              </div>
            )}

            {tab === 'diff' && (
              <div className="flex flex-col gap-3">
                {diffQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando diffs…</p>}
                {diffQuery.data && diffQuery.data.length === 0 && (
                  <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nenhuma alteração de código registrada para este projeto ainda.
                  </p>
                )}

                {diffs.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {diffs.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedDiffId(entry.id)}
                        className={`rounded-md border px-2 py-1 font-mono text-xs ${
                          selectedDiff?.id === entry.id ? 'border-primary text-foreground' : 'border-border text-muted-foreground'
                        }`}
                      >
                        {entry.filePath}
                      </button>
                    ))}
                  </div>
                )}

                {selectedDiff && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono text-foreground">{selectedDiff.filePath}</span>
                      <Badge tone="neutral">{CHANGE_TYPE_LABELS[selectedDiff.changeType] ?? selectedDiff.changeType}</Badge>
                      <span className="text-emerald-700 dark:text-emerald-400">+{selectedDiff.additions}</span>
                      <span className="text-red-700 dark:text-red-400">-{selectedDiff.deletions}</span>
                    </div>

                    {diffTexts ? (
                      <div className="overflow-hidden rounded-md border border-border" data-testid="diff-editor">
                        <MonacoDiffEditor
                          height="480px"
                          language={languageFromPath(selectedDiff.filePath)}
                          original={diffTexts.original}
                          modified={diffTexts.modified}
                          theme={monacoTheme}
                          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
                        />
                      </div>
                    ) : (
                      <div className="rounded-md border border-border p-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          Não foi possível reconstruir os dois lados do diff — exibindo o patch bruto.
                        </p>
                        <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs text-foreground">
                          {selectedDiff.patch}
                        </pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
