/**
 * totalAmount comes from the backend as a decimal-safe string (e.g. "249.50"),
 * not a number — coercing it through Number()/Intl.NumberFormat risks float
 * precision loss, so this just does string formatting instead.
 */
export function formatMoney(amount: string | null, currency: string | null): string {
  if (!amount) return "—";
  return currency ? `${currency} ${amount}` : amount;
}
