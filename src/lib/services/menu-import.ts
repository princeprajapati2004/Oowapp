import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import { z } from "zod";

const ExtractedItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  category: z.string(),
  foodType: z.enum(["VEG", "NON_VEG", "EGG", "NA"]),
  gstNote: z.string().nullable(),
  confidence: z.enum(["high", "low"]),
});

export type ExtractedMenuItem = z.infer<typeof ExtractedItemSchema>;
export type MenuImportItem = ExtractedMenuItem;

export type DuplicateResolution = "skip" | "update" | "keep_both";

export interface CommitMenuImportItem extends MenuImportItem {
  existingProductId?: string | null;
  resolution?: DuplicateResolution;
  imageUrl?: string | null;
}

const UNCATEGORIZED = "Uncategorized";

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const NAME_HEADERS = new Set(["name", "itemname", "item", "dish", "dishname", "product", "productname"]);
const PRICE_HEADERS = new Set(["price", "rate", "cost", "mrp", "amount"]);
const CATEGORY_HEADERS = new Set(["category", "section", "group"]);
const DESCRIPTION_HEADERS = new Set(["description", "desc", "details"]);
const FOODTYPE_HEADERS = new Set(["foodtype", "vegnonveg", "veg"]);
const GST_HEADERS = new Set(["gst", "tax", "gstrate", "taxrate"]);

function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseFoodType(raw: unknown): MenuImportItem["foodType"] {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "NA";
  if (value.includes("egg")) return "EGG";
  if (value.includes("non") || value === "nv" || value === "non-veg") return "NON_VEG";
  if (value === "v" || value.includes("veg")) return "VEG";
  return "NA";
}

/**
 * Deterministic parse — no AI call. Spreadsheets are already structured data,
 * so column-header matching is enough; reserve the Claude extraction path for
 * unstructured sources (photos, PDFs, free-form text).
 */
export function parseSpreadsheet(buffer: Buffer, kind: "excel" | "csv"): MenuImportItem[] {
  const workbook =
    kind === "csv"
      ? XLSX.read(buffer.toString("utf-8"), { type: "string" })
      : XLSX.read(buffer, { type: "buffer" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const items: MenuImportItem[] = [];
  for (const row of rows) {
    let name: string | null = null;
    let price: number | null = null;
    let category: string | null = null;
    let description: string | null = null;
    let foodType: MenuImportItem["foodType"] = "NA";
    let gstNote: string | null = null;

    for (const [rawHeader, rawValue] of Object.entries(row)) {
      const header = normalizeHeader(rawHeader);
      if (NAME_HEADERS.has(header)) {
        name = rawValue == null ? null : String(rawValue).trim();
      } else if (PRICE_HEADERS.has(header)) {
        price = parsePrice(rawValue);
      } else if (CATEGORY_HEADERS.has(header)) {
        category = rawValue == null ? null : String(rawValue).trim();
      } else if (DESCRIPTION_HEADERS.has(header)) {
        description = rawValue == null ? null : String(rawValue).trim();
      } else if (FOODTYPE_HEADERS.has(header)) {
        foodType = parseFoodType(rawValue);
      } else if (GST_HEADERS.has(header)) {
        gstNote = rawValue == null ? null : String(rawValue).trim();
      }
    }

    if (!name) continue; // a row with no recognizable name isn't an item
    items.push({
      name,
      description: description || null,
      price,
      category: category || UNCATEGORIZED,
      foodType,
      gstNote: gstNote || null,
      confidence: price === null ? "low" : "high",
    });
  }

  return items;
}

/** For each item, finds an existing product in the shop with the same name (case-insensitive). */
export async function findDuplicateProductIds(
  shopId: string,
  items: MenuImportItem[]
): Promise<(string | null)[]> {
  const existing = await db.product.findMany({
    where: { shopId },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p.id]));
  return items.map((item) => byName.get(item.name.trim().toLowerCase()) ?? null);
}

async function resolveCategoryIds(shopId: string, names: string[]) {
  const uniqueNames = [...new Set(names.map((n) => n.trim() || UNCATEGORIZED))];
  const existing = await db.category.findMany({
    where: { shopId, name: { in: uniqueNames, mode: "insensitive" } },
  });
  const byLowerName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const toCreate = uniqueNames.filter((name) => !byLowerName.has(name.toLowerCase()));
  if (toCreate.length > 0) {
    const count = await db.category.count({ where: { shopId } });
    const created = await db.$transaction(
      toCreate.map((name, i) =>
        db.category.create({ data: { shopId, name, sortOrder: count + i } })
      )
    );
    for (const c of created) byLowerName.set(c.name.trim().toLowerCase(), c.id);
  }

  return byLowerName;
}

export interface CommitMenuImportResult {
  importId: string;
  imported: number;
  updated: number;
  skipped: number;
}

export async function commitMenuImport(
  shopId: string,
  adminId: string | null,
  sourceType: "PHOTO" | "PDF" | "EXCEL" | "CSV" | "TEXT",
  fileName: string | null,
  items: CommitMenuImportItem[]
): Promise<CommitMenuImportResult> {
  const categoryIds = await resolveCategoryIds(
    shopId,
    items.map((i) => i.category)
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  await db.$transaction(async (tx) => {
    for (const item of items) {
      if (item.resolution === "skip") {
        skipped++;
        continue;
      }

      const categoryId = categoryIds.get(item.category.trim().toLowerCase()) ?? categoryIds.get(UNCATEGORIZED.toLowerCase());
      if (!categoryId) {
        skipped++;
        continue;
      }

      const data = {
        name: item.name,
        description: item.description || null,
        price: item.price ?? 0,
        categoryId,
        imageUrl: item.imageUrl || null,
        foodType: item.foodType,
      };

      if (item.resolution === "update" && item.existingProductId) {
        await tx.product.update({ where: { id: item.existingProductId }, data });
        updated++;
      } else {
        await tx.product.create({ data: { shopId, ...data } });
        imported++;
      }
    }
  });

  const record = await db.menuImport.create({
    data: {
      shopId,
      sourceType,
      fileName,
      status: skipped > 0 && imported === 0 && updated === 0 ? "FAILED" : skipped > 0 ? "PARTIAL" : "COMPLETED",
      itemsImported: imported,
      itemsUpdated: updated,
      itemsSkipped: skipped,
      snapshot: JSON.parse(JSON.stringify(items)),
      createdBy: adminId,
    },
  });

  return { importId: record.id, imported, updated, skipped };
}

export async function listMenuImports(shopId: string) {
  return db.menuImport.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sourceType: true,
      fileName: true,
      status: true,
      itemsImported: true,
      itemsUpdated: true,
      itemsSkipped: true,
      createdAt: true,
    },
  });
}

export async function getMenuImport(shopId: string, id: string) {
  const record = await db.menuImport.findFirst({ where: { id, shopId } });
  if (!record) throw new NotFoundError("Import not found");
  return record;
}
