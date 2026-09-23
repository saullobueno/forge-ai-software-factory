/**
 * Cursor opaco de paginação keyset (Fase 4), usado por listagens ordenadas
 * por `(createdAt desc, id desc)` — ex.: `GET /projects`. Codifica o ponto
 * de corte (timestamp + id do último item da página anterior) em base64url
 * para o cliente tratar como opaco, sem acoplar o formato interno.
 */
export interface KeysetCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(cursor: KeysetCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Retorna `null` para um cursor malformado/adulterado em vez de lançar —
 * quem chama trata isso como "sem cursor" (primeira página), nunca como
 * erro 400: um cursor opaco não é responsabilidade do cliente validar.
 */
export function decodeCursor(cursor: string): KeysetCursor | null {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      !('createdAt' in decoded) ||
      !('id' in decoded) ||
      typeof (decoded as { createdAt: unknown }).createdAt !== 'string' ||
      typeof (decoded as { id: unknown }).id !== 'string'
    ) {
      return null;
    }

    const createdAt = new Date((decoded as { createdAt: string }).createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;

    return { createdAt, id: (decoded as { id: string }).id };
  } catch {
    return null;
  }
}
