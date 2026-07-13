import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { TaxInput } from "@/lib/validation/tax";

export async function listTaxes(shopId: string) {
  return db.tax.findMany({
    where: { shopId },
    orderBy: { sortOrder: "asc" },
    include: { category: true },
  });
}

async function assertCategoryBelongsToShop(shopId: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, shopId } });
  if (!category) throw new NotFoundError("Category not found");
}

function toTaxData(input: TaxInput) {
  return {
    name: input.name,
    type: input.type,
    value: input.value,
    appliesTo: input.appliesTo,
    categoryId: input.appliesTo === "CATEGORY" ? input.categoryId ?? null : null,
    isEnabled: input.isEnabled,
  };
}

export async function createTax(shopId: string, input: TaxInput) {
  if (input.appliesTo === "CATEGORY" && input.categoryId) {
    await assertCategoryBelongsToShop(shopId, input.categoryId);
  }
  const count = await db.tax.count({ where: { shopId } });
  return db.tax.create({
    data: { shopId, ...toTaxData(input), sortOrder: count },
    include: { category: true },
  });
}

async function assertOwnedTax(shopId: string, id: string) {
  const tax = await db.tax.findFirst({ where: { id, shopId } });
  if (!tax) throw new NotFoundError("Tax not found");
  return tax;
}

export async function updateTax(shopId: string, id: string, input: TaxInput) {
  await assertOwnedTax(shopId, id);
  if (input.appliesTo === "CATEGORY" && input.categoryId) {
    await assertCategoryBelongsToShop(shopId, input.categoryId);
  }
  return db.tax.update({
    where: { id },
    data: toTaxData(input),
    include: { category: true },
  });
}

export async function deleteTax(shopId: string, id: string) {
  await assertOwnedTax(shopId, id);
  await db.tax.delete({ where: { id } });
}
