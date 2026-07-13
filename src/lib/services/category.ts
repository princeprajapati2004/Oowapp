import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { CategoryInput } from "@/lib/validation/category";

export async function listCategories(shopId: string) {
  return db.category.findMany({ where: { shopId }, orderBy: { sortOrder: "asc" } });
}

export async function createCategory(shopId: string, input: CategoryInput) {
  const count = await db.category.count({ where: { shopId } });
  return db.category.create({ data: { shopId, ...input, sortOrder: count } });
}

async function assertOwnedCategory(shopId: string, id: string) {
  const category = await db.category.findFirst({ where: { id, shopId } });
  if (!category) throw new NotFoundError("Category not found");
  return category;
}

export async function updateCategory(
  shopId: string,
  id: string,
  input: Partial<CategoryInput>
) {
  await assertOwnedCategory(shopId, id);
  return db.category.update({ where: { id }, data: input });
}

export async function deleteCategory(shopId: string, id: string) {
  await assertOwnedCategory(shopId, id);
  await db.category.delete({ where: { id } });
}

export async function reorderCategories(shopId: string, orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, index) =>
      db.category.updateMany({ where: { id, shopId }, data: { sortOrder: index } })
    )
  );
}
