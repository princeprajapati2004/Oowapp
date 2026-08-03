import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import {
  extractMenuItemsFromImage,
  extractMenuItemsFromPdf,
  extractMenuItemsFromText,
  isSupportedImageType,
} from "@/lib/services/menu-import-ai";
import { parseSpreadsheet, findDuplicateProductIds, type MenuImportItem } from "@/lib/services/menu-import";

const MAX_SIZE = 10 * 1024 * 1024;

type SourceType = "PHOTO" | "PDF" | "EXCEL" | "CSV" | "TEXT";

function classify(file: File): SourceType | null {
  const name = file.name.toLowerCase();
  if (isSupportedImageType(file.type)) return "PHOTO";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "PDF";
  if (
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel" ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    return "EXCEL";
  }
  if (file.type === "text/csv" || name.endsWith(".csv")) return "CSV";
  if (file.type === "text/plain" || name.endsWith(".txt")) return "TEXT";
  return null;
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File must be smaller than 10MB" }, { status: 400 });
    }

    const sourceType = classify(file);
    if (!sourceType) {
      return NextResponse.json(
        { error: "Unsupported file type — use a photo, PDF, Excel, CSV, or text file." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let items: MenuImportItem[];
    switch (sourceType) {
      case "PHOTO":
        items = await extractMenuItemsFromImage(
          buffer.toString("base64"),
          file.type as Parameters<typeof extractMenuItemsFromImage>[1]
        );
        break;
      case "PDF":
        items = await extractMenuItemsFromPdf(buffer.toString("base64"));
        break;
      case "TEXT":
        items = await extractMenuItemsFromText(buffer.toString("utf-8"));
        break;
      case "EXCEL":
        items = parseSpreadsheet(buffer, "excel");
        break;
      case "CSV":
        items = parseSpreadsheet(buffer, "csv");
        break;
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "No menu items could be found in this file." }, { status: 400 });
    }

    const duplicateIds = await findDuplicateProductIds(session.shopId, items);
    const matchedIds = duplicateIds.filter((id): id is string => id !== null);
    const existingProducts = matchedIds.length
      ? await db.product.findMany({ where: { id: { in: matchedIds } } })
      : [];
    const existingById = new Map(existingProducts.map((p) => [p.id, p]));

    const itemsWithDuplicates = items.map((item, i) => {
      const dupId = duplicateIds[i];
      const existing = dupId ? existingById.get(dupId) : undefined;
      return {
        ...item,
        existingProductId: dupId,
        duplicateOf: existing
          ? { id: existing.id, name: existing.name, price: Number(existing.price), imageUrl: existing.imageUrl }
          : null,
      };
    });

    return NextResponse.json({
      sourceType,
      fileName: file.name,
      items: itemsWithDuplicates,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
