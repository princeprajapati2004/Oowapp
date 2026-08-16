import { db } from "@/lib/db";
import { NotFoundError, ConflictError } from "@/lib/api-utils";
import type { ProductInput } from "@/lib/validation/product";

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

function toProductData(input: ProductInput) {
  return {
    name: input.name,
    description: input.description || null,
    price: input.price,
    categoryId: input.categoryId,
    imageUrl: input.imageUrl || null,
    unit: input.unit || null,
    barcode: input.barcode || null,
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
  await assertUniqueBarcode(shopId, input.barcode || null);
  const barcode = input.barcode?.trim() || (await generateUniqueBarcode(shopId));
  return db.product.create({
    data: { shopId, ...toProductData(input), barcode },
    include: { category: true },
  });
}

async function assertOwnedProduct(shopId: string, id: string) {
  const product = await db.product.findFirst({ where: { id, shopId } });
  if (!product) throw new NotFoundError("Product not found");
  return product;
}

export async function updateProduct(shopId: string, id: string, input: ProductInput) {
  await assertOwnedProduct(shopId, id);
  await assertCategoryBelongsToShop(shopId, input.categoryId);
  await assertUniqueBarcode(shopId, input.barcode || null, id);
  return db.product.update({
    where: { id },
    data: toProductData(input),
    include: { category: true },
  });
}

export async function deleteProduct(shopId: string, id: string) {
  await assertOwnedProduct(shopId, id);
  await db.product.delete({ where: { id } });
}
