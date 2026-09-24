import { resolve, relative, isAbsolute } from 'node:path';

export function resolveInsideWorkspace(workspaceRoot: string, requestedPath = '.'): string {
  const root = resolve(workspaceRoot);
  const candidate = resolve(root, requestedPath);
  const rel = relative(root, candidate);

  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return candidate;
  }

  throw new Error(`Caminho fora do workspace isolado: ${requestedPath}`);
}

export function commandLineForPolicy(command: string, args: readonly string[] = []): string {
  return [command, ...args].map(quoteCommandPart).join(' ');
}

function quoteCommandPart(part: string): string {
  if (!/[\s"'`$\\]/.test(part)) return part;
  return JSON.stringify(part);
}
