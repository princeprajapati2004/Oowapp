"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      width: 1.6,
      height: 50,
      displayValue: false,
      margin: 0,
    });
  }, [value]);

  return <svg ref={ref} />;
}
