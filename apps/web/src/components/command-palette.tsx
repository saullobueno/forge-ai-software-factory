'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { AGENT_RUN_STATUS_LABELS, TASK_STATUS_LABELS } from '@/lib/labels';
import type { ApiSearchResults } from '@/lib/types';

/** Evento que qualquer botão pode disparar para abrir a busca (além do atalho Ctrl/Cmd+K). */
export const OPEN_SEARCH_EVENT = 'forge:open-search';

interface PaletteItem {
  key: string;
  group: 'Projetos' | 'Tarefas' | 'Execuções de IA';
  label: string;
  hint: string;
  href: string;
}

function toItems(results: ApiSearchResults | undefined): PaletteItem[] {
  if (!results) return [];
  return [
    ...results.projects.map((project) => ({
      key: `project-${project.id}`,
      group: 'Projetos' as const,
      label: project.name,
      hint: project.slug,
      href: `/projects/${project.id}`,
    })),
    ...results.tasks.map((task) => ({
      key: `task-${task.id}`,
      group: 'Tarefas' as const,
      label: task.title,
      hint: `${task.projectName} · ${TASK_STATUS_LABELS[task.status]}`,
      href: `/projects/${task.projectId}/tasks/${task.id}`,
    })),
    ...results.agentRuns.map((run) => ({
      key: `run-${run.id}`,
      group: 'Execuções de IA' as const,
      label: run.objective,
      hint: `${run.projectName} · ${AGENT_RUN_STATUS_LABELS[run.status]}`,
      href: `/projects/${run.projectId}/tasks/${run.taskId}/runs/${run.id}`,
    })),
  ];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  // O diálogo monta do zero a cada abertura: sem estado para "resetar" ao fechar.
  return open ? <PaletteDialog onClose={() => setOpen(false)} /> : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => apiFetch<ApiSearchResults>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 15_000,
  });

  const items = useMemo(() => toItems(searchQuery.data), [searchQuery.data]);
  const groups = useMemo(() => {
    const order: PaletteItem['group'][] = ['Projetos', 'Tarefas', 'Execuções de IA'];
    return order
      .map((group) => ({ group, entries: items.filter((item) => item.group === group) }))
      .filter((entry) => entry.entries.length > 0);
  }, [items]);

  const go = (item: PaletteItem) => {
    onClose();
    router.push(item.href);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (items.length === 0 ? 0 : (index + 1) % items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (items.length === 0 ? 0 : (index - 1 + items.length) % items.length));
    } else if (event.key === 'Enter') {
      const item = items[activeIndex];
      if (item) {
        event.preventDefault();
        go(item);
      }
    }
  };

  const active = items[activeIndex];
  const showEmpty = debounced.length >= 2 && searchQuery.isSuccess && items.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[15vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        data-testid="command-palette"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-background shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <label htmlFor="global-search" className="sr-only">
            Buscar projetos, tarefas e execuções
          </label>
          <input
            id="global-search"
            ref={inputRef}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="global-search-results"
            aria-activedescendant={active ? `option-${active.key}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar projetos, tarefas e execuções…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div id="global-search-results" role="listbox" aria-label="Resultados" className="max-h-80 overflow-y-auto p-1">
          {debounced.length < 2 && <p className="px-3 py-4 text-sm text-muted-foreground">Digite ao menos 2 caracteres.</p>}
          {searchQuery.isFetching && items.length === 0 && debounced.length >= 2 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">Buscando…</p>
          )}
          {showEmpty && <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum resultado para &quot;{debounced}&quot;.</p>}
          {groups.map(({ group, entries }) => (
            <div key={group} role="group" aria-label={group}>
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground" aria-hidden>
                {group}
              </p>
              {entries.map((item) => {
                const isActive = active?.key === item.key;
                return (
                  <div
                    key={item.key}
                    id={`option-${item.key}`}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIndex(items.findIndex((candidate) => candidate.key === item.key))}
                    onClick={() => go(item)}
                    className={`flex cursor-pointer flex-col rounded-md px-3 py-2 ${isActive ? 'bg-muted' : ''}`}
                  >
                    <span className="truncate text-sm font-medium">{item.label}</span>
                    <span className={`truncate text-xs ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{item.hint}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          ↑ ↓ para navegar · Enter para abrir · Esc para fechar
        </p>
      </div>
    </div>
  );
}
