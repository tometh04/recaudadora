export type Currency = 'ARS' | 'USD';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  ARS: '$',
  USD: 'US$',
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  ARS: 'Peso Argentino',
  USD: 'Dolar Estadounidense',
};

export function formatCurrencyAmount(amount: number, currency: Currency = 'ARS'): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
  }).format(amount);
}

export function convertCurrency(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  rate: number
): number {
  if (fromCurrency === toCurrency) return amount;
  if (fromCurrency === 'USD' && toCurrency === 'ARS') {
    return amount * rate;
  }
  if (fromCurrency === 'ARS' && toCurrency === 'USD') {
    return amount / rate;
  }
  return amount;
}
