const CURRENCY_LOCALE: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
};

export function formatCurrency(amount: number | string, currency = "INR") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  const locale = CURRENCY_LOCALE[currency] ?? "en-IN";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function currencySymbol(currency = "INR") {
  const parts = new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-IN", {
    style: "currency",
    currency,
  }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}
