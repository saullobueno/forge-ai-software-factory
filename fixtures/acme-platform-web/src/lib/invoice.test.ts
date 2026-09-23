import { describe, expect, it } from 'vitest';
import { calculateInvoiceTotal, formatInvoiceSummary, type Invoice } from './invoice';

const invoice: Invoice = {
  id: 'INV-1042',
  currency: 'BRL',
  lineItems: [
    { description: 'Plano Pro (mensal)', amountInCents: 19900 },
    { description: 'Estorno parcial — downgrade em 12/09', amountInCents: -4500 },
  ],
};

describe('calculateInvoiceTotal', () => {
  it('soma itens positivos e negativos (estornos)', () => {
    expect(calculateInvoiceTotal(invoice)).toBe(15400);
  });
});

describe('formatInvoiceSummary', () => {
  it('inclui o sinal negativo do estorno no resumo', () => {
    const summary = formatInvoiceSummary(invoice);
    expect(summary).toContain('-R$ 45,00');
    expect(summary).toContain('R$ 154,00');
  });
});
