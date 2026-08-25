import Image from "next/image";
import { CheckCircle2, CreditCard, MessageCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";
import { paymentMethodLabel } from "@/lib/order-status";

/**
 * Two mutually-exclusive faces: while unpaid, this is the payment-request UI
 * (QR + WhatsApp send); once PAID, it becomes a plain confirmation message —
 * the reference design deliberately never shows both the QR/"send payment"
 * controls and a paid confirmation at once (brief §14, "QR disappears/
 * changes appropriately after payment").
 */
export function PaymentMethodsCard({
  isPaid,
  paidAmount,
  paymentMethod,
  transactionReference,
  currency,
  upiId,
  businessName,
  bankAccountNumber,
  bankName,
  bankIfsc,
  acceptCash,
  paymentQrImageUrl,
  paymentQr,
  amountDue,
  canSendWhatsApp,
  onSendWhatsApp,
  onConfirmPayment,
}: {
  isPaid: boolean;
  paidAmount: number;
  paymentMethod: string | null;
  transactionReference: string | null;
  currency: string;
  upiId: string | null;
  businessName: string;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankIfsc: string | null;
  acceptCash: boolean;
  paymentQrImageUrl: string | null;
  paymentQr: string | null;
  amountDue: number;
  canSendWhatsApp: boolean;
  onSendWhatsApp: () => void;
  // Owner-side action — records the payment via the existing payment modal.
  // Optional so this card can still be reused in a context with no owner
  // actions available.
  onConfirmPayment?: () => void;
}) {
  if (isPaid) {
    return (
      <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20">
        <div className="flex items-center gap-2 px-4 py-3.5 sm:px-5">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">
            Payment Received ({formatCurrency(paidAmount, currency)}) via {paymentMethodLabel(paymentMethod)}
          </p>
        </div>
        {transactionReference && (
          <p className="px-4 pb-3 font-mono text-xs text-emerald-700/80 sm:px-5 dark:text-emerald-400/80">
            Ref: {transactionReference}
          </p>
        )}
      </div>
    );
  }

  const hasAnyMethod = upiId || bankAccountNumber || acceptCash || paymentQrImageUrl;
  if (!hasAnyMethod) return null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="px-4 py-2.5 border-b bg-muted/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment Methods</p>
      </div>
      <div className="space-y-2.5 px-4 py-3 sm:px-5">
        {upiId && <p className="text-sm font-semibold">UPI ID: {upiId}</p>}

        {bankAccountNumber && (
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <p className="font-medium text-foreground">Bank Transfer</p>
            {bankName && <p className="text-muted-foreground">{bankName}</p>}
            <p className="text-muted-foreground">A/C: {bankAccountNumber}</p>
            {bankIfsc && <p className="text-muted-foreground">IFSC: {bankIfsc}</p>}
          </div>
        )}

        {acceptCash && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block size-2 shrink-0 rounded-full bg-emerald-500" />
            <span>Cash accepted</span>
          </div>
        )}

        {(paymentQr || paymentQrImageUrl) && (
          <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
            {paymentQr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={paymentQr} alt="Scan to pay" width={60} height={60} className="shrink-0 rounded-md border bg-white object-contain p-1" />
            ) : (
              paymentQrImageUrl && (
                <Image src={paymentQrImageUrl} alt="Scan to pay" width={60} height={60} unoptimized className="shrink-0 rounded-md border bg-white object-contain p-1" />
              )
            )}
            <p className="text-sm text-muted-foreground">
              Scan to pay {amountDue > 0 && <span className="font-semibold text-foreground">{formatCurrency(amountDue, currency)}</span>} via{" "}
              <span className="font-semibold text-foreground">{businessName}</span>
            </p>
          </div>
        )}

        {(onConfirmPayment || canSendWhatsApp) && (
          <div className="flex gap-2">
            {onConfirmPayment && (
              <button
                type="button"
                onClick={onConfirmPayment}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#FFA000] text-sm font-bold text-white hover:bg-[#e69200]"
              >
                <CreditCard className="size-3.5" /> Add Payment
              </button>
            )}

            {canSendWhatsApp && (
              <button
                type="button"
                onClick={onSendWhatsApp}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25d366] text-sm font-bold text-white hover:bg-[#1ebc57]"
              >
                <MessageCircle className="size-4" />
                Send Payment
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
