import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

/**
 * Tamanho da derived key em bytes. 64 é o padrão recomendado para scrypt
 * (equivalente a uma chave de 512 bits).
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hash de senha usando `node:crypto` (scrypt) — built-in do Node, sem
 * dependência com binário nativo (spec Fase 2: evita aprovação de build
 * scripts numa sessão sem supervisão; bcrypt/argon2 exigiriam isso).
 *
 * Formato de armazenamento: `"<salt-hex>:<hash-hex>"`, um único campo de
 * texto em `users.password_hash`. O salt é gerado por senha (nunca
 * reaproveitado), então duas senhas idênticas produzem hashes diferentes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifica uma senha em texto claro contra um hash armazenado no formato
 * `hashPassword`. Comparação em tempo constante (`timingSafeEqual`) para
 * não vazar informação por timing. Qualquer formato inesperado (hash nulo,
 * malformado, ou de tamanho incompatível) é tratado como "não confere" —
 * nunca lança para o chamador tratar como sucesso por acidente.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;

  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const hashBuffer = Buffer.from(hash, 'hex');
  if (hashBuffer.length !== derivedKey.length) return false;

  return timingSafeEqual(derivedKey, hashBuffer);
}
