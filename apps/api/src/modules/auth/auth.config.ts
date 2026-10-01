import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function positiveNumber(name: string, fallback: number, source: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(source[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Tempos de sessão, lidos do ambiente a cada uso (defaults seguros):
 * - acesso: JWT curto (15 min) — o que vale em cada requisição;
 * - refresh: token opaco rotativo (7 dias deslizantes);
 * - teto absoluto da sessão (30 dias): depois disso é preciso entrar de novo.
 */
export function readSessionTimes(source: NodeJS.ProcessEnv = process.env) {
  return {
    accessTtlSeconds: Math.round(positiveNumber('ACCESS_TOKEN_TTL_MINUTES', 15, source) * 60),
    refreshTtlMs: positiveNumber('REFRESH_TOKEN_TTL_DAYS', 7, source) * DAY_MS,
    sessionMaxAgeMs: positiveNumber('SESSION_MAX_AGE_DAYS', 30, source) * DAY_MS,
  };
}

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Chave do AES-256-GCM que protege o segredo TOTP no banco: `TOTP_ENCRYPTION_KEY`
 * se definida; senão derivada de `JWT_SECRET` (girar o JWT_SECRET invalida os 2FA
 * já configurados — defina a chave própria para evitar isso).
 */
function totpKey(source: NodeJS.ProcessEnv = process.env): Buffer {
  const material = source['TOTP_ENCRYPTION_KEY'] ?? `forge-totp:${source['JWT_SECRET'] ?? 'dev-insecure-secret-change-me'}`;
  return createHash('sha256').update(material).digest();
}

/** `iv:tag:dados` em base64url. */
export function encryptTotpSecret(secret: string, source: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', totpKey(source), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join(':');
}

export function decryptTotpSecret(payload: string, source: NodeJS.ProcessEnv = process.env): string {
  const [iv, tag, data] = payload.split(':').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !data) throw new Error('Segredo TOTP malformado.');
  const decipher = createDecipheriv('aes-256-gcm', totpKey(source), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
