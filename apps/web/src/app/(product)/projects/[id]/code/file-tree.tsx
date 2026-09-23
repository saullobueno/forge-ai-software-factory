'use client';

import type { ApiTreeNode } from '@/lib/types';

/**
 * Árvore de arquivos recursiva (spec §10 — "árvore do repositório").
 * Diretórios são só apresentacionais (sempre expandidos — o fixture de
 * demonstração é pequeno o bastante para não precisar de colapsar/expandir
 * sob demanda); arquivos são clicáveis e abrem no visualizador.
 */
export function FileTree({
  nodes,
  selectedPath,
  onSelectFile,
  depth = 0,
}: {
  nodes: ApiTreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? 'flex flex-col gap-0.5' : 'ml-2.5 flex flex-col gap-0.5 border-l border-border pl-2'}>
      {nodes.map((node) => (
        <li key={node.path}>
          {node.type === 'directory' ? (
            <>
              <div className="flex items-center gap-1.5 px-1.5 py-1 text-sm text-muted-foreground">
                <span aria-hidden>📁</span>
                <span>{node.name}</span>
              </div>
              {node.children && node.children.length > 0 && (
                <FileTree
                  nodes={node.children}
                  selectedPath={selectedPath}
                  onSelectFile={onSelectFile}
                  depth={depth + 1}
                />
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => onSelectFile(node.path)}
              aria-current={selectedPath === node.path ? 'true' : undefined}
              className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted ${
                selectedPath === node.path ? 'bg-muted font-medium text-foreground' : 'text-foreground/90'
              }`}
            >
              <span aria-hidden>📄</span>
              <span className="truncate">{node.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
