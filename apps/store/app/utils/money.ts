/**
 * Formats a decimal-string amount from the API (e.g. "24.99") for display.
 * Converting to a number here is safe: it's display only -- all money
 * arithmetic happens server-side on Decimals.
 */
export function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}
