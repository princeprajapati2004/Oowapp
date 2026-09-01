import type { ReportPdfShopMeta } from "@/lib/utils/report-pdf";

// Rendered only when the page is actually printed (window.print()) — the
// on-screen ReportPageHeader/filter bar are hidden via print:hidden instead,
// so a printed report reads like the PDF export rather than a web app.
export function ReportPrintHeader({
  shop,
  reportTitle,
  dateRangeLabel,
}: {
  shop: ReportPdfShopMeta;
  reportTitle: string;
  dateRangeLabel: string;
}) {
  const contactLine = [shop.phone, shop.gstNumber ? `GSTIN: ${shop.gstNumber}` : null].filter(Boolean).join(" | ");
  return (
    <div className="mb-4 hidden text-center print:block">
      <h1 className="text-lg font-bold">{shop.businessName}</h1>
      {shop.address && <p className="text-xs">{shop.address}</p>}
      {contactLine && <p className="text-xs">{contactLine}</p>}
      <h2 className="mt-2 text-base font-semibold">{reportTitle}</h2>
      <p className="text-xs text-muted-foreground">{dateRangeLabel}</p>
    </div>
  );
}
