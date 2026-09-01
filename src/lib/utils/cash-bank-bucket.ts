const CASH_METHODS = new Set(["CASH", "COD"]);

export type CashBankBucket = "CASH" | "BANK" | "UNKNOWN";

/**
 * There is no bank/cash "Account" entity in the schema — `method` is a free
 * string on PaymentRecord/PartyPayment/Expense. This buckets by a static,
 * documented mapping rather than a fabricated precise split: anything not
 * literally CASH/COD is treated as "Bank / Digital" (UPI, GPAY, PHONEPE,
 * CARD, DEBIT_CARD, BANK_TRANSFER, ONLINE, OTHER, ...), since nothing in the
 * schema distinguishes which bank account or UPI handle a given transaction
 * actually moved through. Directionally accurate, not bank-reconciliation
 * grade — every report using this surfaces that caveat in its own copy
 * rather than presenting the split as precise.
 */
export function cashBankBucket(method: string | null | undefined): CashBankBucket {
  if (!method) return "UNKNOWN";
  return CASH_METHODS.has(method.toUpperCase()) ? "CASH" : "BANK";
}
