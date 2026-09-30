import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotp,
  generateTotpSecret,
  hotp,
  verifyTotp,
} from './totp.ts';

// Segredo de teste da RFC 4226/6238: ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('base32', () => {
  it('codifica e decodifica (vetores da RFC 4648)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('mzxw 6ytb oi===').toString()).toBe('foobar');
  });

  it('rejeita caracteres fora do alfabeto', () => {
    expect(() => base32Decode('abc1')).toThrow();
  });
});

describe('HOTP (RFC 4226) e TOTP (RFC 6238)', () => {
  it('reproduz os vetores de teste do HOTP (apêndice D)', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code));
  });

  it('reproduz os vetores de teste do TOTP (8 dígitos, SHA-1) da RFC 6238', () => {
    expect(hotp(RFC_SECRET, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(hotp(RFC_SECRET, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(hotp(RFC_SECRET, Math.floor(2000000000 / 30), 8)).toBe('69279037');
  });

  it('generateTotp usa o passo de 30 s', () => {
    expect(generateTotp(RFC_SECRET, 59_000)).toBe('287082');
  });
});

describe('verifyTotp', () => {
  const now = 1_700_000_000_000;

  it('aceita o código atual e devolve o contador que bateu', () => {
    const code = generateTotp(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, now)).toBe(Math.floor(now / 30_000));
  });

  it('tolera um passo de diferença para cada lado, mas não mais', () => {
    const previous = generateTotp(RFC_SECRET, now - 30_000);
    const next = generateTotp(RFC_SECRET, now + 30_000);
    const old = generateTotp(RFC_SECRET, now - 90_000);
    expect(verifyTotp(RFC_SECRET, previous, now)).toBe(Math.floor(now / 30_000) - 1);
    expect(verifyTotp(RFC_SECRET, next, now)).toBe(Math.floor(now / 30_000) + 1);
    expect(verifyTotp(RFC_SECRET, old, now)).toBeNull();
  });

  it('rejeita códigos errados ou malformados e ignora espaços', () => {
    const code = generateTotp(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, '000000' === code ? '111111' : '000000', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now)).not.toBeNull();
  });
});

describe('utilitários', () => {
  it('gera segredos base32 de 160 bits, distintos a cada chamada', () => {
    const a = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/u);
    expect(generateTotpSecret()).not.toBe(a);
  });

  it('monta a URI otpauth com issuer e conta codificados', () => {
    const url = buildOtpAuthUrl('Forge AI', 'dev@acme.example', 'ABC234');
    expect(url).toBe('otpauth://totp/Forge%20AI:dev%40acme.example?secret=ABC234&issuer=Forge%20AI&algorithm=SHA1&digits=6&period=30');
  });

  it('gera códigos de recuperação únicos no formato xxxxx-xxxxx', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/u);
  });
});
