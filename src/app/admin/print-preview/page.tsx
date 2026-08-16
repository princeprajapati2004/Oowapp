import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { PRINT_FORMATS, type PrintFormat } from "@/lib/types/print";
import { sampleBillOrder } from "@/lib/utils/sample-bill-data";
import { PrintPreviewClient } from "@/components/printing/print-preview-client";

// Deliberately outside (dashboard) — a bare, printable page (no sidebar) the
// same way /admin/counter and /admin/kitchen are. Never touches the
// database beyond reading shop info; the order shown is always the sample
// from sample-bill-data.ts (print spec §10/§31 — Preview/Test Print must
// never create a real order).
export default async function PrintPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);
  const { format: rawFormat } = await searchParams;
  const format: PrintFormat = PRINT_FORMATS.some((f) => f.value === rawFormat)
    ? (rawFormat as PrintFormat)
    : shop.printFormat;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as any;

  return (
    <PrintPreviewClient
      format={format}
      order={sampleBillOrder()}
      shop={{
        slug: shop.slug,
        businessName: shop.businessName,
        logoUrl: shop.logoUrl,
        address: shop.address,
        phone: shop.phone,
        whatsappNumber: shop.whatsappNumber,
        gstNumber: shop.gstNumber,
        currency: shop.currency,
        upiId: shop.upiId,
        acceptCash: shop.acceptCash,
        bankAccountNumber: shop.bankAccountNumber,
        bankName: shop.bankName,
        bankIfsc: shop.bankIfsc,
        paymentQrImageUrl: shop.paymentQrImageUrl,
        paymentDisplayName: (shopAny.paymentDisplayName as string | null) ?? null,
        enableTableNumber: (shopAny.enableTableNumber as boolean) ?? true,
        enableOrderBarcodeLabels: (shopAny.enableOrderBarcodeLabels as boolean) ?? false,
        printFormat: format,
      }}
    />
  );
}
