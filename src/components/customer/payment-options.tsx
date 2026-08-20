"use client";

import Image from "next/image";
import { Banknote, QrCode as QrCodeIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";

// Structural shape shared by every shop object a payment surface might be
// built from (CustomerShop, order-tracker's narrower Shop DTO, etc.) — only
// the fields this component actually reads.
export type PaymentOptionsShop = {
  businessName: string;
  currency: string;
  upiId?: string | null;
  acceptCash?: boolean;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  bankIfsc?: string | null;
  paymentQrImageUrl?: string | null;
  paymentDisplayName?: string | null;
  googlePayUpi?: string | null;
  phonePeUpi?: string | null;
  paytmUpi?: string | null;
  bhimUpi?: string | null;
};

// ── Payment options ─────────────────────────────────────────────────────────
// Shared by current-order-page.tsx (table-session final bill) and
// order-tracker.tsx (standalone order payment) — one payment surface, reused
// rather than reimplemented, so "how a customer pays" looks and behaves
// identically everywhere it appears (brief: "do not create a second
// independent payment system").
export function PaymentOptions({
  shop,
  grandTotal,
  upiQrDataUrl,
  onPayViaUpi,
  onPayCash,
}: {
  shop: PaymentOptionsShop;
  grandTotal: number;
  upiQrDataUrl: string | null;
  onPayViaUpi: () => void;
  onPayCash: () => void;
}) {
  const payeeName = shop.paymentDisplayName || shop.businessName;
  const hasQr = !!(shop.paymentQrImageUrl || upiQrDataUrl);
  const hasUpi = !!shop.upiId;
  const hasCash = shop.acceptCash;
  const hasBank = !!shop.bankAccountNumber;

  if (!hasQr && !hasUpi && !hasCash && !hasBank) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-4 text-center text-sm text-muted-foreground">
        Please pay at the counter or ask the staff for payment details.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Scan QR (restaurant's uploaded QR or auto-generated UPI QR) */}
      {hasQr && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center justify-center gap-1.5">
            <QrCodeIcon className="size-3.5 text-muted-foreground" />
            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Scan to Pay via UPI</p>
          </div>
          <div className="px-4 py-5 flex flex-col items-center gap-3">
            <div className="rounded-2xl border-2 border-border bg-white p-3 shadow-sm">
              {shop.paymentQrImageUrl ? (
                <Image
                  src={shop.paymentQrImageUrl}
                  alt="Scan to pay"
                  width={220}
                  height={220}
                  unoptimized
                  className="object-contain"
                />
              ) : upiQrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={upiQrDataUrl} alt="UPI payment QR code" width={220} height={220} />
              ) : null}
            </div>
            <div className="text-center space-y-1">
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(grandTotal, shop.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                Pay to <span className="font-semibold text-foreground">{payeeName}</span>
              </p>
              {shop.upiId && (
                <p className="text-xs text-muted-foreground font-mono">{shop.upiId}</p>
              )}
              <p className="text-xs text-muted-foreground pt-0.5">
                Works with Google Pay · PhonePe · Paytm · BHIM · Amazon Pay · any UPI app
              </p>
              {(shop.googlePayUpi || shop.phonePeUpi || shop.paytmUpi || shop.bhimUpi) && (
                <div className="w-full pt-2 mt-1 border-t space-y-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground text-center">Also accepts</p>
                  {shop.googlePayUpi && (
                    <p className="text-[11px] text-muted-foreground text-center">Google Pay: {shop.googlePayUpi}</p>
                  )}
                  {shop.phonePeUpi && (
                    <p className="text-[11px] text-muted-foreground text-center">PhonePe: {shop.phonePeUpi}</p>
                  )}
                  {shop.paytmUpi && (
                    <p className="text-[11px] text-muted-foreground text-center">Paytm: {shop.paytmUpi}</p>
                  )}
                  {shop.bhimUpi && (
                    <p className="text-[11px] text-muted-foreground text-center">BHIM: {shop.bhimUpi}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Large primary payment actions — Cash first, then UPI app deep link */}
      <div className="space-y-2.5">
        {hasCash && (
          <button
            type="button"
            onClick={onPayCash}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#FFA000] text-[15px] font-bold text-white transition-colors hover:bg-[#e69200] active:scale-[0.99]"
          >
            <Banknote className="size-[18px]" />
            Cash Payment ({formatCurrency(grandTotal, shop.currency)})
          </button>
        )}
        {hasUpi && (
          <button
            type="button"
            onClick={onPayViaUpi}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#00A86B] text-[15px] font-bold text-white transition-colors hover:bg-[#00925d] active:scale-[0.99]"
          >
            <QrCodeIcon className="size-[18px]" />
            Pay {formatCurrency(grandTotal, shop.currency)} via GPay / UPI
          </button>
        )}
      </div>

      {/* Bank transfer (supplementary info) */}
      {hasBank && (
        <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs space-y-0.5">
          <p className="font-semibold text-foreground">Bank Transfer</p>
          {shop.bankName && <p className="text-muted-foreground">{shop.bankName}</p>}
          <p className="text-muted-foreground">A/C: {shop.bankAccountNumber}</p>
          {shop.bankIfsc && <p className="text-muted-foreground">IFSC: {shop.bankIfsc}</p>}
          {shop.bankAccountNumber && (
            <p className="text-muted-foreground">
              Amount: <span className="font-semibold text-foreground">{formatCurrency(grandTotal, shop.currency)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
