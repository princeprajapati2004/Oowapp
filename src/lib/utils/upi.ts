/**
 * Shared UPI deep-link builder — extracted from the pattern already used by
 * the customer checkout screen (current-order-page.tsx) so the owner payment
 * modal generates an identical, real `upi://pay` intent rather than a
 * second, drifted implementation. No gateway is involved (this app has
 * none) — it's the same "scan with any UPI app" deep link either screen
 * has always used.
 */
export function buildUpiPaymentUri(params: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}): string {
  const { upiId, payeeName, amount, note } = params;
  const tn = note || payeeName;
  return (
    `upi://pay?pa=${encodeURIComponent(upiId)}` +
    `&pn=${encodeURIComponent(payeeName)}` +
    `&am=${amount.toFixed(2)}` +
    `&cu=INR` +
    `&tn=${encodeURIComponent(tn)}`
  );
}
