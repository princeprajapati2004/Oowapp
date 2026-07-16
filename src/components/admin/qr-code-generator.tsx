"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { Download, ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

function downloadBlob(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export function QrCodeGenerator({ slug, businessName }: { slug: string; businessName: string }) {
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [orderUrl, setOrderUrl] = useState("");

  useEffect(() => {
    // window.location is only available client-side, so the URL and QR images must be computed post-mount.
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const url = `${base}/order/${slug}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold tracking-tight">QR code</h1>
        <p className="text-muted-foreground">Print this and place it on tables or your counter.</p>
      </div>

      <Card className="print:hidden max-w-md">
        <CardHeader>
          <CardTitle>Your ordering link</CardTitle>
          <CardDescription className="break-all">{orderUrl}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {pngDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pngDataUrl} alt="QR code" className="size-56 rounded-lg border p-2" />
          ) : null}
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" onClick={downloadPng}>
              <Download className="size-4" /> PNG
            </Button>
            <Button variant="outline" onClick={downloadSvg}>
              <Download className="size-4" /> SVG
            </Button>
            <Button variant="outline" onClick={downloadPdf}>
              <Download className="size-4" /> PDF
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full"
            render={<a href={`/order/${slug}`} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink className="size-4" /> Preview customer view
          </Button>
        </CardContent>
      </Card>

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
