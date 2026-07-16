"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { Download, ExternalLink, Printer, Grid2x2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { isFoodBusiness, type BusinessType } from "@/lib/business-types";

function downloadBlob(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function QrCodeGenerator({
  slug,
  businessName,
  businessType,
}: {
  slug: string;
  businessName: string;
  businessType: BusinessType;
}) {
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [orderUrl, setOrderUrl] = useState("");

  // Table QR state
  const [tableCountInput, setTableCountInput] = useState("5");
  const [tableQrs, setTableQrs] = useState<{ table: number; dataUrl: string }[]>([]);
  const [generatingTables, setGeneratingTables] = useState(false);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const url = `${base}/order/${slug}`;
    setOrderUrl(url);
    QRCode.toDataURL(url, { width: 480, margin: 2 }).then(setPngDataUrl);
    QRCode.toString(url, { type: "svg", width: 480, margin: 2 }).then(setSvgMarkup);
  }, [slug]);

  function downloadPng() {
    if (pngDataUrl) downloadBlob(pngDataUrl, `${slug}-qr.png`);
  }

  function downloadSvg() {
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    downloadBlob(url, `${slug}-qr.svg`);
    URL.revokeObjectURL(url);
  }

  function downloadPdf() {
    if (!pngDataUrl) return;
    const doc = new jsPDF({ unit: "pt", format: "a6" });
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text(businessName, pageWidth / 2, 40, { align: "center" });
    doc.setFontSize(10);
    doc.text("Scan to view menu & order", pageWidth / 2, 58, { align: "center" });
    const size = pageWidth - 80;
    doc.addImage(pngDataUrl, "PNG", 40, 80, size, size);
    doc.save(`${slug}-qr.pdf`);
  }

  async function generateTableQrs() {
    const n = parseInt(tableCountInput, 10);
    if (!n || n < 1 || n > 50) return;
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    setGeneratingTables(true);
    const qrs = await Promise.all(
      Array.from({ length: n }, async (_, i) => {
        const table = i + 1;
        const url = `${base}/order/${slug}?table=${table}`;
        const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
        return { table, dataUrl };
      })
    );
    setTableQrs(qrs);
    setGeneratingTables(false);
  }

  function downloadAllTablesPdf() {
    if (!tableQrs.length) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const cols = 3;
    const margin = 40;
    const colWidth = (pageWidth - margin * 2) / cols;
    const qrSize = colWidth - 24;
    const rowHeight = qrSize + 36;
    const rowsPerPage = Math.floor((pageHeight - margin * 2) / rowHeight);
    const itemsPerPage = cols * rowsPerPage;

    tableQrs.forEach(({ table, dataUrl }, i) => {
      if (i > 0 && i % itemsPerPage === 0) doc.addPage();
      const posOnPage = i % itemsPerPage;
      const col = posOnPage % cols;
      const row = Math.floor(posOnPage / cols);
      const x = margin + col * colWidth + 12;
      const y = margin + row * rowHeight;
      doc.setFontSize(9);
      doc.text(businessName, x + qrSize / 2, y + 10, { align: "center" });
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Table ${table}`, x + qrSize / 2, y + 22, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.addImage(dataUrl, "PNG", x, y + 26, qrSize, qrSize);
    });
    doc.save(`${slug}-table-qrs.pdf`);
  }

  return (
    <div className="space-y-6 max-w-md">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold tracking-tight">QR code</h1>
        <p className="text-muted-foreground">Print this and place it on tables or your counter.</p>
      </div>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your ordering link</CardTitle>
          <CardDescription className="break-all text-xs font-mono">{orderUrl}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-5">
          {pngDataUrl ? (
            <div className="rounded-2xl border-2 border-border p-4 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pngDataUrl} alt="QR code" className="size-64" />
            </div>
          ) : (
            <div className="size-72 rounded-2xl border-2 border-dashed border-border flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Generating QR…</p>
            </div>
          )}
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" onClick={downloadPng} className="h-9">
              <Download className="size-4" /> PNG
            </Button>
            <Button variant="outline" onClick={downloadSvg} className="h-9">
              <Download className="size-4" /> SVG
            </Button>
            <Button variant="outline" onClick={downloadPdf} className="h-9">
              <Download className="size-4" /> PDF
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="h-9">
              <Printer className="size-4" /> Print
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            render={<a href={`/order/${slug}`} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink className="size-4" /> Preview customer view
          </Button>
        </CardContent>
      </Card>

      {isFoodBusiness(businessType) && (
        <Card className="print:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Grid2x2 className="size-4 text-muted-foreground" />
              Table QR codes
            </CardTitle>
            <CardDescription>
              Generate a dedicated QR code per table. Customers scan their table&apos;s QR and the table number is auto-filled in the order — no manual entry needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor="table-count" className="text-sm font-medium">
                  Number of tables
                </label>
                <Input
                  id="table-count"
                  type="number"
                  min={1}
                  max={50}
                  value={tableCountInput}
                  onChange={(e) => setTableCountInput(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button onClick={generateTableQrs} disabled={generatingTables} className="h-9">
                {generatingTables ? "Generating…" : "Generate"}
              </Button>
            </div>

            {tableQrs.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{tableQrs.length} table QRs ready</p>
                  <Button variant="outline" size="sm" onClick={downloadAllTablesPdf}>
                    <Download className="size-3.5" /> Download all (PDF)
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {tableQrs.map(({ table, dataUrl }) => (
                    <div
                      key={table}
                      className="flex flex-col items-center gap-1.5 rounded-xl border bg-card p-2.5"
                    >
                      <p className="text-xs font-semibold">Table {table}</p>
                      <div className="rounded-lg border bg-white p-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={dataUrl} alt={`Table ${table} QR`} className="size-20" />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-full text-xs"
                        onClick={() => downloadBlob(dataUrl, `${slug}-table-${table}.png`)}
                      >
                        <Download className="size-3" /> PNG
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="hidden print:flex print:min-h-screen print:flex-col print:items-center print:justify-center print:gap-4">
        {pngDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pngDataUrl} alt="QR code" className="w-72" />
        ) : null}
        <p className="text-2xl font-bold">{businessName}</p>
        <p className="text-lg">Scan to view menu &amp; order</p>
      </div>
    </div>
  );
}
