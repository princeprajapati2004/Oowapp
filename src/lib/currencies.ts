export const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "AUD", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];
