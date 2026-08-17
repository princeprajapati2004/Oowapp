// Real ESC/POS command bytes (Epson's de-facto standard most thermal
// printers implement) — not a simulation. Text is encoded as UTF-8, which
// covers plain ASCII bills correctly on virtually every ESC/POS printer;
// printers vary in code-page support for non-Latin scripts, which this
// deliberately doesn't attempt to solve (out of scope — see printing
// README notes).
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type Align = "left" | "center" | "right";

/** Low-level byte builder — compose commands, then getBytes()/getBase64() once. */
export class EscPosBuilder {
  private chunks: number[] = [];

  private push(...bytes: number[]) {
    this.chunks.push(...bytes);
    return this;
  }

  /** ESC @ — reset the printer to its power-on defaults. Always call first. */
  init() {
    return this.push(ESC, 0x40);
  }

  align(align: Align) {
    const n = align === "center" ? 1 : align === "right" ? 2 : 0;
    return this.push(ESC, 0x61, n);
  }

  bold(on: boolean) {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }

  /** GS ! n — n=0x00 normal, 0x11 double width+height (common "big text" combo). */
  size(double: boolean) {
    return this.push(GS, 0x21, double ? 0x11 : 0x00);
  }

  text(line: string) {
    const bytes = Array.from(new TextEncoder().encode(line));
    this.chunks.push(...bytes);
    return this;
  }

  line(text = "") {
    this.text(text);
    return this.push(LF);
  }

  feed(lines = 1) {
    for (let i = 0; i < lines; i++) this.push(LF);
    return this;
  }

  /** GS V m — m=0 full cut. Partial cut (m=1) is the safer default on printers without a full-cut blade, but full cut is the most widely supported baseline. */
  cut() {
    return this.push(GS, 0x56, 0x00);
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.chunks);
  }

  /** btoa (not Buffer) — this builder runs in the browser (Bluetooth/USB adapters write getBytes() directly) as well as in the bridge server, which needs base64 to move bytes over JSON. */
  getBase64(): string {
    let binary = "";
    for (const byte of this.chunks) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
}

export type ReceiptLine =
  | { kind: "text"; text: string; align?: Align; bold?: boolean; big?: boolean }
  | { kind: "row"; left: string; right: string; bold?: boolean }
  | { kind: "divider" }
  | { kind: "feed"; lines?: number };

/**
 * Renders a sequence of logical receipt lines into ESC/POS bytes at a given
 * character width (58mm ≈ 32 cols, 80mm ≈ 48 cols on standard Font A) —
 * the same content model the on-screen ThermalReceipt template uses, kept
 * separate so both can share the same generateThermalReceiptLines() call
 * (see receipt-lines.ts) without duplicating what a receipt says.
 */
export function renderEscPosReceipt(lines: ReceiptLine[], charWidth: number): Uint8Array {
  const b = new EscPosBuilder();
  b.init();

  for (const l of lines) {
    switch (l.kind) {
      case "text":
        b.align(l.align ?? "left");
        b.bold(!!l.bold);
        b.size(!!l.big);
        b.line(l.text);
        break;
      case "row": {
        b.align("left");
        b.bold(!!l.bold);
        b.size(false);
        const gap = Math.max(1, charWidth - l.left.length - l.right.length);
        b.line(l.left + " ".repeat(gap) + l.right);
        break;
      }
      case "divider":
        b.align("left");
        b.bold(false);
        b.size(false);
        b.line("-".repeat(charWidth));
        break;
      case "feed":
        b.feed(l.lines ?? 1);
        break;
    }
  }

  // Reset formatting before feeding/cutting so a half-configured state
  // never leaks into whatever the printer does next.
  b.align("left");
  b.bold(false);
  b.size(false);
  b.feed(3);
  b.cut();
  return b.getBytes();
}
