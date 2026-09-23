import { formatCurrency, type SupportedCurrency } from './format-currency';

export interface InvoiceLineItem {
  description: string;
  amountInCents: number;
}

export interface Invoice {
  id: string;
  currency: SupportedCurrency;
  lineItems: InvoiceLineItem[];
}

/** Soma os itens de uma fatura, incluindo itens negativos (estornos/créditos). */
export function calculateInvoiceTotal(invoice: Invoice): number {
  return invoice.lineItems.reduce((total, item) => total + item.amountInCents, 0);
}

/** Monta o resumo textual de uma fatura exibido ao cliente. */
export function formatInvoiceSummary(invoice: Invoice): string {
  const lines = invoice.lineItems.map(
    (item) => `  ${item.description}: ${formatCurrency(item.amountInCents, invoice.currency)}`,
  );
  const total = formatCurrency(calculateInvoiceTotal(invoice), invoice.currency);
  return [`Fatura ${invoice.id}`, ...lines, `  Total: ${total}`].join('\n');
}
