import { NotFoundException, Injectable } from '@nestjs/common';
import { readdir, readFile as readFileAsync, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TreeNode {
  name: string;
  /** Caminho relativo à raiz do repositório, sempre com separador `/`. */
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

export interface RepositoryFile {
  /** Caminho relativo normalizado (separador `/`), o mesmo recebido do cliente. */
  path: string;
  content: string;
  sizeBytes: number;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
/**
 * `apps/api/src/modules/code` (ou `apps/api/dist/modules/code` depois de
 * compilado — `nest build` espelha `src` em `dist` com o mesmo `rootDir`,
 * mesma profundidade) até a raiz do monorepo: `apps` -> `api` ->
 * `src`|`dist` -> `modules` -> `code` = 5 segmentos, daí os 5 `..`. Mesmo
 * raciocínio de `packages/database/src/seed/fixtures.ts` para
 * `FIXTURE_ROOT`.
 */
const REPO_ROOT = join(currentDir, '..', '..', '..', '..', '..');
export const FIXTURES_ROOT = join(REPO_ROOT, 'fixtures');

const IGNORED_DIRECTORY_NAMES = new Set(['node_modules']);

function isHidden(entryName: string): boolean {
  return entryName.startsWith('.');
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function isEscapingRoot(relativeFromRoot: string): boolean {
  return relativeFromRoot === '..' || relativeFromRoot.startsWith(`..${sep}`) || isAbsolute(relativeFromRoot);
}

/**
 * Leitura direta do repositório demo em disco (`fixtures/<name>`, spec
 * §21 — Modo Demo) via `node:fs`. **Isto é um substituto deliberado, não a
 * arquitetura final**: a Fase 10 introduz `packages/git` (interface +
 * providers Mock/GitHub reais) para resolver árvore/arquivo/busca por
 * provider; nenhum destes métodos deveria sobreviver àquela fase sem virar
 * uma chamada ao adaptador.
 */
@Injectable()
export class RepositoryFsService {
  /**
   * O layout de disco atual não particiona por `owner` — o fixture inteiro
   * em `fixtures/<name>` já É o repositório demo (`acme-platform-web`), daí
   * resolver só pelo `name` do `repositories` seedado (`owner` não entra
   * no caminho).
   */
  resolveRepositoryRoot(repositoryName: string): string {
    return join(FIXTURES_ROOT, repositoryName);
  }

  async ensureRepositoryExists(root: string): Promise<void> {
    try {
      const info = await stat(root);
      if (!info.isDirectory()) throw new Error('not a directory');
    } catch {
      throw new NotFoundException('Repositório não encontrado.');
    }
  }

  /**
   * Resolve um caminho relativo recebido do cliente dentro de `root`,
   * recusando qualquer tentativa de escapar do diretório do repositório
   * (`../../../etc/passwd`, variantes com `\`, caminhos absolutos tipo
   * `C:\Windows\...`) — sempre com o mesmo 404 genérico usado para "não
   * existe", nunca vazando se o alvo fora do escopo existe de verdade.
   */
  resolveWithinRoot(root: string, relativePath: string): string {
    const normalized = normalizeRelativePath(relativePath);
    const candidate = join(root, normalized);
    const relativeFromRoot = relative(root, candidate);
    if (isEscapingRoot(relativeFromRoot)) {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    return candidate;
  }

  async readFile(root: string, relativePath: string): Promise<RepositoryFile> {
    const normalized = normalizeRelativePath(relativePath);
    const absolutePath = this.resolveWithinRoot(root, normalized);

    let info;
    try {
      info = await stat(absolutePath);
    } catch {
      throw new NotFoundException('Arquivo não encontrado.');
    }
    if (!info.isFile()) {
      throw new NotFoundException('Arquivo não encontrado.');
    }

    const content = await readFileAsync(absolutePath, 'utf8');
    return { path: normalized, content, sizeBytes: info.size };
  }

  async getTree(root: string): Promise<TreeNode[]> {
    return this.readDirectory(root, '');
  }

  private async readDirectory(absoluteDir: string, relativeDir: string): Promise<TreeNode[]> {
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      if (isHidden(entry.name) || IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;

      const entryRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const entryAbsolute = join(absoluteDir, entry.name);

      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: entryRelative,
          type: 'directory',
          children: await this.readDirectory(entryAbsolute, entryRelative),
        });
      } else if (entry.isFile()) {
        nodes.push({ name: entry.name, path: entryRelative, type: 'file' });
      }
    }

    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Lista todo arquivo de texto do repositório (nome + conteúdo), para a
   * busca simples por substring (spec §10 — "não construa um índice de
   * busca real, é um repositório de demonstração pequeno").
   */
  async listAllFiles(root: string): Promise<RepositoryFile[]> {
    const tree = await this.getTree(root);
    const files: RepositoryFile[] = [];
    await this.collectFiles(root, tree, files);
    return files;
  }

  private async collectFiles(root: string, nodes: TreeNode[], out: RepositoryFile[]): Promise<void> {
    for (const node of nodes) {
      if (node.type === 'file') {
        out.push(await this.readFile(root, node.path));
      } else if (node.children) {
        await this.collectFiles(root, node.children, out);
      }
    }
  }
}
