import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
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

function toProductData(input: ProductInput) {
  return {
    name: input.name,
    description: input.description || null,
    price: input.price,
    categoryId: input.categoryId,
    imageUrl: input.imageUrl || null,
    unit: input.unit || null,
    foodType: input.foodType,
    isAvailable: input.isAvailable,
    isVisible: input.isVisible,
    stock: input.stock ?? null,
    sortOrder: input.sortOrder,
  };
}

export async function createProduct(shopId: string, input: ProductInput) {
  await assertCategoryBelongsToShop(shopId, input.categoryId);
  return db.product.create({
    data: { shopId, ...toProductData(input) },
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
