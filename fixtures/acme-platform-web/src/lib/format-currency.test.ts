import { describe, expect, it } from 'vitest';
import { formatCurrency } from './format-currency';

describe('formatCurrency', () => {
  it('formata valores positivos em BRL', () => {
    expect(formatCurrency(123456, 'BRL')).toBe('R$ 1.234,56');
  });

  it('preserva o sinal negativo em estornos', () => {
    expect(formatCurrency(-1234, 'BRL')).toBe('-R$ 12,34');
  });

  it('formata valores em USD', () => {
    expect(formatCurrency(500, 'USD')).toBe('$5.00');
  });

  it('rejeita valores não finitos', () => {
    expect(() => formatCurrency(Number.NaN)).toThrow(TypeError);
  });
});
