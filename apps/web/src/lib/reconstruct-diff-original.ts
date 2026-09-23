import { applyPatch, parsePatch, reversePatch } from 'diff';

/**
 * Reconstrói o texto "antes" de um patch unificado (`diffs.patch`, spec
 * §10/§16) a partir do conteúdo "depois" completo — para alimentar o
 * `DiffEditor` do Monaco, que precisa dos dois textos inteiros, não de um
 * patch.
 *
 * Por quê reconstruir em vez de simplesmente ler as linhas do patch: um
 * unified diff (`createTwoFilesPatch`, ver `packages/database/src/seed/fixtures.ts`)
 * só inclui algumas linhas de CONTEXTO ao redor de cada hunk alterado, não
 * o arquivo inteiro — então não existe informação suficiente no patch
 * sozinho para montar o texto completo de nenhum dos dois lados quando o
 * arquivo tem partes inalteradas fora desse contexto (é exatamente o caso
 * do fixture de demonstração, cujo patch real tem só 2 hunks parciais).
 * A única informação completa disponível é o conteúdo ATUAL do arquivo em
 * disco (`modifiedContent`, lido via `GET .../repository/file` — o mesmo
 * texto "depois" que o seed gravou), então o "antes" é derivado revertendo
 * o patch sobre ele com a mesma biblioteca (`diff`, pacote npm puro JS) que
 * gerou o patch originalmente — simétrico e testável, em vez de uma
 * reconstrução manual linha a linha que só funcionaria para patches de
 * arquivo inteiro.
 *
 * Retorna `null` se o patch não puder ser interpretado ou não se aplicar
 * (revertido) de forma limpa sobre `modifiedContent` — quem chama decide o
 * fallback (ex.: mostrar o patch bruto).
 */
export function reconstructOriginalFromPatch(modifiedContent: string, patch: string): string | null {
  let parsedFiles;
  try {
    parsedFiles = parsePatch(patch);
  } catch {
    return null;
  }

  const parsed = parsedFiles[0];
  if (!parsed) return null;

  const reversed = reversePatch(parsed);
  const applied = applyPatch(modifiedContent, reversed);
  return applied === false ? null : applied;
}
