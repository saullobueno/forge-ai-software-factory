import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238, HMAC-SHA1, 30 s, 6 dígitos) implementado só com `node:crypto`
 * — compatível com Google Authenticator, Authy, 1Password etc. Funções puras:
 * quem chama decide o relógio (`nowMs`), o que torna tudo testável.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/u, '').replace(/\s+/gu, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Segredo base32 inválido.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segredo novo (160 bits, o tamanho recomendado pela RFC 4226) em base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Código TOTP do contador (`floor(t / step)`). */
export function hotp(secretBase32: string, counter: number, digits = DEFAULT_DIGITS): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(buffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totpCounter(nowMs: number, stepSeconds = DEFAULT_STEP_SECONDS): number {
  return Math.floor(nowMs / 1000 / stepSeconds);
}

export function generateTotp(secretBase32: string, nowMs: number, digits = DEFAULT_DIGITS): string {
  return hotp(secretBase32, totpCounter(nowMs), digits);
}

/**
 * Confere `code` na janela `[-window, +window]` passos (tolera relógio
 * levemente fora). Devolve o contador que bateu — quem chama deve guardá-lo
 * e recusar contadores `<=` ao último aceito (impede reutilizar o mesmo
 * código) — ou `null` se nenhum confere. Comparação em tempo constante.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs: number, window = 1): number | null {
  const normalized = code.replace(/\s+/gu, '');
  if (!/^\d{6}$/u.test(normalized)) return null;
  const current = totpCounter(nowMs);
  let matched: number | null = null;
  for (let delta = -window; delta <= window; delta += 1) {
    const expected = Buffer.from(hotp(secretBase32, current + delta));
    const received = Buffer.from(normalized);
    if (expected.length === received.length && timingSafeEqual(expected, received) && matched === null) {
      matched = current + delta;
    }
  }
  return matched;
}

/** URI `otpauth://` para apps autenticadores (entrada manual ou QR). */
export function buildOtpAuthUrl(issuer: string, account: string, secretBase32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Códigos de recuperação de uso único, no formato `xxxxx-xxxxx`. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const chars = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}
