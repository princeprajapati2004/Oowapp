import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { caseInsensitive } from "@/lib/db-provider";
import { NotFoundError, ConflictError, ProductError } from "@/lib/api-utils";
import { getOrCreateItemSettings } from "@/lib/services/item-settings";
import type { ProductInput, ProductPatchInput } from "@/lib/validation/product";

export async function listProducts(shopId: string) {
  return db.product.findMany({
    where: { shopId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { category: true },
  });
}

async function assertCategoryBelongsToShop(shopId: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, shopId } });
  if (!category) throw new NotFoundError("Category not found");
}

async function assertUniqueBarcode(shopId: string, barcode: string | null, excludeId?: string) {
  if (!barcode) return;
  const clash = await db.product.findFirst({
    where: { shopId, barcode, id: excludeId ? { not: excludeId } : undefined },
  });
  if (clash) throw new ConflictError(`Barcode already in use by "${clash.name}"`);
}

// Auto-fill for products added without scanning/typing a barcode (e.g. via
// the Quick Actions "Add Product" flow). 12 digits, EAN-13-shaped, prefixed
// with the current timestamp so collisions within one shop are effectively
// impossible — the uniqueness loop is just a safety net.
async function generateUniqueBarcode(shopId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${Date.now()}${Math.floor(Math.random() * 900) + 100}`.slice(-12);
    const clash = await db.product.findFirst({ where: { shopId, barcode: candidate } });
    if (!clash) return candidate;
  }
  throw new ConflictError("Could not generate a unique barcode. Please try again.");
}

async function assertUniqueProductCode(shopId: string, productCode: string | null, excludeId?: string) {
  if (!productCode) return;
  const clash = await db.product.findFirst({
    where: { shopId, productCode, id: excludeId ? { not: excludeId } : undefined },
  });
  if (clash) throw new ConflictError(`Product code "${productCode}" is already in use by "${clash.name}"`);
}

// "ITEM-001", "ITEM-002", ... — sequential, human-readable (spec example),
// unlike the random EAN-shaped barcode generator above. Retries past any
// gaps left by deleted products, same safety-net convention as barcode.
async function generateUniqueProductCode(shopId: string): Promise<string> {
  const count = await db.product.count({ where: { shopId } });
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `ITEM-${String(count + 1 + attempt).padStart(3, "0")}`;
    const clash = await db.product.findFirst({ where: { shopId, productCode: candidate } });
    if (!clash) return candidate;
  }
  throw new ConflictError("Could not generate a unique product code. Please try again.");
}

// Soft-ish duplicate guard (spec: "prevent duplicate product names within
// the same business where appropriate") — exact match, case-insensitive.
// The product list's "Duplicate" action names its clone "<name> (Copy)" so
// it never collides with this check.
async function assertUniqueName(shopId: string, name: string, excludeId?: string) {
  const clash = await db.product.findFirst({
    where: { shopId, name: { equals: name, ...caseInsensitive() }, id: excludeId ? { not: excludeId } : undefined },
  });
  if (clash) throw new ProductError(`A product named "${name}" already exists`);
}

async function assertHsnRequirement(shopId: string, hsnCode: string | null) {
  const settings = await getOrCreateItemSettings(shopId);
  if (settings.hsnEnabled && settings.hsnRequired && !hsnCode) {
    throw new ProductError("HSN code is required for this business");
  }
}

function toProductData(input: ProductInput) {
  return {
    name: input.name,
    description: input.description || null,
    price: input.price,
    costPrice: input.costPrice ?? null,
    mrp: input.mrp ?? null,
    wholesalePrice: input.wholesalePrice ?? null,
    categoryId: input.categoryId,
    imageUrl: input.imageUrl || null,
    unit: input.unit || null,
    barcode: input.barcode || null,
    hsnCode: input.hsnCode || null,
    productCode: input.productCode || null,
    productType: input.productType || null,
    serialNumber: input.serialNumber || null,
    batchNumber: input.batchNumber || null,
    openingStock: input.openingStock ?? null,
    offerType: input.offerType || null,
    offerValue: input.offerType ? (input.offerValue ?? null) : null,
    foodType: input.foodType,
    isCombo: input.isCombo,
    offerNote: input.offerNote || null,
    isAvailable: input.isAvailable,
    isVisible: input.isVisible,
    stock: input.stock ?? null,
    sortOrder: input.sortOrder,
  };
}

export async function createProduct(shopId: string, input: ProductInput) {
  await assertCategoryBelongsToShop(shopId, input.categoryId);
  await assertUniqueName(shopId, input.name);
  await assertUniqueBarcode(shopId, input.barcode || null);
  await assertUniqueProductCode(shopId, input.productCode || null);
  await assertHsnRequirement(shopId, input.hsnCode || null);

  const settings = await getOrCreateItemSettings(shopId);
  const barcode = input.barcode?.trim() || (await generateUniqueBarcode(shopId));
  const productCode =
    input.productCode?.trim() || (settings.productCodeEnabled ? await generateUniqueProductCode(shopId) : null);

  const data = toProductData(input);
  // Opening stock, if given, seeds the live/mutable `stock` counter too —
  // it's the starting point of the Current Stock formula (spec §11), not a
  // separate ledger.
  const stock = data.stock ?? data.openingStock;

  return db.product.create({
    data: { shopId, ...data, barcode, productCode, stock },
    include: { category: true },
  });
}

async function assertOwnedProduct(shopId: string, id: string) {
  const product = await db.product.findFirst({ where: { id, shopId } });
  if (!product) throw new NotFoundError("Product not found");
  return product;
}

// Real partial update — only the keys present in `input` are validated
// and written; everything else on the existing row is left untouched. This
// is what lets e.g. the products list's inline "available" toggle PATCH
// `{ isAvailable }` alone instead of needing to resend the full product.
export async function updateProduct(shopId: string, id: string, input: ProductPatchInput) {
  const existing = await assertOwnedProduct(shopId, id);

  if (input.categoryId !== undefined) await assertCategoryBelongsToShop(shopId, input.categoryId);
  if (input.name !== undefined) await assertUniqueName(shopId, input.name, id);
  if (input.barcode !== undefined) await assertUniqueBarcode(shopId, input.barcode || null, id);
  if (input.productCode !== undefined) await assertUniqueProductCode(shopId, input.productCode || null, id);
  // Only re-checked when hsnCode is actually part of this PATCH — an
  // unrelated edit (e.g. toggling isAvailable) must never retroactively
  // block on a requirement that didn't exist when this product was created.
  if (input.hsnCode !== undefined) await assertHsnRequirement(shopId, input.hsnCode || null);

  const data: Prisma.ProductUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.price !== undefined) data.price = input.price;
  if (input.costPrice !== undefined) data.costPrice = input.costPrice ?? null;
  if (input.mrp !== undefined) data.mrp = input.mrp ?? null;
  if (input.wholesalePrice !== undefined) data.wholesalePrice = input.wholesalePrice ?? null;
  if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl || null;
  if (input.unit !== undefined) data.unit = input.unit || null;
  if (input.barcode !== undefined) data.barcode = input.barcode || null;
  if (input.hsnCode !== undefined) data.hsnCode = input.hsnCode || null;
  if (input.productCode !== undefined) data.productCode = input.productCode || null;
  if (input.productType !== undefined) data.productType = input.productType || null;
  if (input.serialNumber !== undefined) data.serialNumber = input.serialNumber || null;
  if (input.batchNumber !== undefined) data.batchNumber = input.batchNumber || null;
  if (input.openingStock !== undefined) data.openingStock = input.openingStock ?? null;
  // offerValue only means anything alongside a truthy offerType — clear it
  // whenever offerType is being cleared, and fall back to the existing
  // stored value if offerType changes without a paired new offerValue.
  if (input.offerType !== undefined) {
    data.offerType = input.offerType || null;
    data.offerValue = input.offerType ? (input.offerValue ?? existing.offerValue) : null;
  } else if (input.offerValue !== undefined) {
    data.offerValue = existing.offerType ? input.offerValue : null;
  }
  if (input.foodType !== undefined) data.foodType = input.foodType;
  if (input.isCombo !== undefined) data.isCombo = input.isCombo;
  if (input.offerNote !== undefined) data.offerNote = input.offerNote || null;
  if (input.isAvailable !== undefined) data.isAvailable = input.isAvailable;
  if (input.isVisible !== undefined) data.isVisible = input.isVisible;
  if (input.stock !== undefined) data.stock = input.stock ?? null;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  return db.product.update({
    where: { id },
    data,
    include: { category: true },
  });
}

export async function deleteProduct(shopId: string, id: string) {
  await assertOwnedProduct(shopId, id);
  await db.product.delete({ where: { id } });
}

// Product List "Duplicate" action (spec §14) — clones every field except
// identity/uniqueness-bearing ones (barcode, productCode get regenerated so
// they never collide; name gets " (Copy)" suffixed past assertUniqueName).
export async function duplicateProduct(shopId: string, id: string) {
  const existing = await assertOwnedProduct(shopId, id);
  const settings = await getOrCreateItemSettings(shopId);

  const barcode = await generateUniqueBarcode(shopId);
  const productCode = settings.productCodeEnabled ? await generateUniqueProductCode(shopId) : null;

  return db.product.create({
    data: {
      shopId,
      categoryId: existing.categoryId,
      name: `${existing.name} (Copy)`,
      description: existing.description,
      price: existing.price,
      costPrice: existing.costPrice,
      mrp: existing.mrp,
      wholesalePrice: existing.wholesalePrice,
      imageUrl: existing.imageUrl,
      unit: existing.unit,
      barcode,
      hsnCode: existing.hsnCode,
      productCode,
      productType: existing.productType,
      // Serial number is per-unit — never duplicated onto a second product.
      serialNumber: null,
      batchNumber: existing.batchNumber,
      openingStock: null,
      offerType: existing.offerType,
      offerValue: existing.offerValue,
      foodType: existing.foodType,
      isCombo: existing.isCombo,
      offerNote: existing.offerNote,
      isAvailable: existing.isAvailable,
      isVisible: existing.isVisible,
      // Stock is never duplicated — a copy starts with no stock of its own.
      stock: null,
      sortOrder: existing.sortOrder,
    },
    include: { category: true },
  });
}
