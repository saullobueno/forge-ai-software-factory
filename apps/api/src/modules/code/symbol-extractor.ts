import ts from 'typescript';

export type CodeSymbolKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 're-export';

export interface CodeSymbol {
  name: string;
  kind: CodeSymbolKind;
  /** 1-based, para linkar direto no editor. */
  line: number;
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function isExported(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node);
  return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/**
 * Extrai símbolos top-level exportados de um arquivo `.ts`/`.tsx` via TS
 * Compiler API — parsing sintático puro de um arquivo isolado (sem montar
 * um `Program`/language service, sem type-checking), portanto
 * determinístico e barato. Cobre exatamente o que a spec §10 pede
 * ("metadados de símbolos/referências quando disponíveis") — não é, e não
 * tenta ser, um language server completo (sem "vá para definição"/"achar
 * referências" cross-file).
 */
export function extractTopLevelSymbols(fileName: string, sourceText: string): CodeSymbol[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(fileName),
  );

  const symbols: CodeSymbol[] = [];
  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      symbols.push({ name: statement.name.text, kind: 'function', line: lineOf(statement) });
    } else if (ts.isClassDeclaration(statement) && statement.name && isExported(statement)) {
      symbols.push({ name: statement.name.text, kind: 'class', line: lineOf(statement) });
    } else if (ts.isInterfaceDeclaration(statement) && isExported(statement)) {
      symbols.push({ name: statement.name.text, kind: 'interface', line: lineOf(statement) });
    } else if (ts.isTypeAliasDeclaration(statement) && isExported(statement)) {
      symbols.push({ name: statement.name.text, kind: 'type', line: lineOf(statement) });
    } else if (ts.isEnumDeclaration(statement) && isExported(statement)) {
      symbols.push({ name: statement.name.text, kind: 'enum', line: lineOf(statement) });
    } else if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          symbols.push({ name: declaration.name.text, kind: 'variable', line: lineOf(statement) });
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      // `export { foo, type Bar } from './somewhere'` — reexports não são
      // declarações locais, mas ainda são "símbolos" que este arquivo
      // expõe publicamente, então valem a pena listar.
      for (const element of statement.exportClause.elements) {
        symbols.push({ name: element.name.text, kind: 're-export', line: lineOf(statement) });
      }
    }
  }

  return symbols;
}
