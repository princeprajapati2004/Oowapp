import { printFormatPageCss, type PrintFormat } from "@/lib/types/print";
import type { BillOrderData, BillShopData } from "@/lib/hooks/use-bill-actions";
import { ThermalReceipt } from "./templates/thermal-receipt";
import { A4Style1Invoice } from "./templates/a4-style-1";
import { A4Style2Invoice } from "./templates/a4-style-2";
import { A4Style3Invoice } from "./templates/a4-style-3";
import { A4Style4Invoice } from "./templates/a4-style-4";
import { A3Invoice } from "./templates/a3";

export type BillDocumentProps = {
  format: PrintFormat;
  order: BillOrderData;
  shop: BillShopData;
};

// One bill data model (BillOrderData/BillShopData — already the single
// source used by useBillActions and the PDF download), many presentation
// templates. Adding a format means adding a case here, never a second bill
// calculation.
function renderTemplate({ format, order, shop }: BillDocumentProps) {
  switch (format) {
    case "THERMAL_58":
      return <ThermalReceipt order={order} shop={shop} width="58" />;
    case "THERMAL_80":
      return <ThermalReceipt order={order} shop={shop} width="80" />;
    case "A4_STYLE_1":
      return <A4Style1Invoice order={order} shop={shop} />;
    case "A4_STYLE_2":
      return <A4Style2Invoice order={order} shop={shop} />;
    case "A4_STYLE_3":
      return <A4Style3Invoice order={order} shop={shop} />;
    case "A4_STYLE_4":
      return <A4Style4Invoice order={order} shop={shop} />;
    case "A3":
      return <A3Invoice order={order} shop={shop} />;
  }
}

// A fixed, audited set of Tailwind utilities this project's build never
// generates for newly-added files (confirmed by grepping every compiled
// stylesheet in devtools — present in some existing, long-scanned files but
// absent for classes only these new print templates use; surviving a full
// `.next` cache wipe, so it isn't Turbopack staleness). Rather than
// hand-edit ~70 className strings across 6 templates, or risk missing the
// next one silently, every class these templates rely on is defined here
// once — a real class selector beats body's tag-selector color rule
// regardless of source order, so this is safe even where the class *does*
// generate correctly elsewhere.
const CSS_FALLBACKS = `
.text-black { color: #000; }
.text-gray-500 { color: #6b7280; }
.text-gray-600 { color: #4b5563; }
.text-gray-700 { color: #374151; }
.text-gray-800 { color: #1f2937; }
.border-black { border-color: #000; }
.border-gray-200 { border-color: #e5e7eb; }
.border-gray-300 { border-color: #d1d5db; }
.border-gray-400 { border-color: #9ca3af; }
.border-t-2 { border-top-width: 2px; }
.border-t-4 { border-top-width: 4px; }
.border-b-2 { border-bottom-width: 2px; }
.border-b-4 { border-bottom-width: 4px; }
.font-extrabold { font-weight: 800; }
.overflow-auto { overflow: auto; }
.pr-0 { padding-right: 0px; }
.mt-6 { margin-top: 1.5rem; }
.mt-24 { margin-top: 6rem; }
`;

/** Renders the selected format's template plus its matching @page rule. Visible wherever mounted — callers decide on-screen vs print-only placement (see PrintOnlyBill). */
export function BillDocument(props: BillDocumentProps) {
  return (
    <>
      {/* Static, non-order-derived CSS strings — not user input. */}
      <style dangerouslySetInnerHTML={{ __html: printFormatPageCss(props.format) + CSS_FALLBACKS }} />
      {renderTemplate(props)}
    </>
  );
}

/** Mounted at all times but only rendered to the page during window.print() — pairs with print:hidden on the surrounding on-screen UI (see CSS print isolation, print spec §23). */
export function PrintOnlyBill(props: BillDocumentProps) {
  return (
    <div className="hidden print:block">
      <BillDocument {...props} />
    </div>
  );
}
