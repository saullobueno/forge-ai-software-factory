/**
 * Moedas suportadas pela Acme Platform para exibição de valores monetários
 * em faturas, estornos e resumos de cobrança.
 */
export type SupportedCurrency = 'BRL' | 'USD' | 'EUR';

const LOCALE_BY_CURRENCY: Record<SupportedCurrency, string> = {
  BRL: 'pt-BR',
  USD: 'en-US',
  EUR: 'de-DE',
};

/**
 * Formata um valor monetário informado em centavos (inteiro, para evitar
 * erros de arredondamento de ponto flutuante) como string localizada,
 * preservando o sinal para valores negativos (estornos e créditos).
 *
 * Exemplo: `formatCurrency(-1234, 'BRL')` -> `"-R$ 12,34"`.
 */
export function formatCurrency(
  amountInCents: number,
  currencyCode: SupportedCurrency = 'BRL',
): string {
  if (!Number.isFinite(amountInCents)) {
    throw new TypeError(`amountInCents precisa ser um número finito, recebeu: ${amountInCents}`);
  }

  const amount = amountInCents / 100;

  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currencyCode], {
    style: 'currency',
    currency: currencyCode,
  }).format(amount);
}
